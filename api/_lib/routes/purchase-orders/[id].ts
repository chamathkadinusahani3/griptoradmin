import type { VercelRequest, VercelResponse } from '@vercel/node';
import mongoose from 'mongoose';
import { connectToDatabase } from '../../db.js';
import { PurchaseOrder, PurchaseOrderDoc } from '../../models/PurchaseOrder.js';
import { Part } from '../../models/Part.js';
import { Supplier, SupplierDoc } from '../../models/Supplier.js';
import { GoodsReceivedNote } from '../../models/GoodsReceivedNote.js';
import { requireTenantPermission } from '../../auth.js';
import { generateSequentialNumber } from '../../numbering.js';
import { effectiveReceivedQuantity } from '../../purchaseOrderReceiving.js';
import { serializePurchaseOrder } from '../../serializers.js';

interface UpdateLine {
  partId?: string;
  quantity?: number;
  unitCost?: number;
}

interface UpdatePurchaseOrderBody {
  items?: UpdateLine[];
  expectedDate?: string;
  notes?: string;
  action?: 'order' | 'receive' | 'cancel';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'purchase-orders:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing purchase order id' });

  await connectToDatabase();

  const existing = (await PurchaseOrder.findOne({ _id: id, clientId: session.clientId }).lean()) as PurchaseOrderDoc | null;
  if (!existing) return res.status(404).json({ error: 'Purchase order not found' });

  const body = (req.body ?? {}) as UpdatePurchaseOrderBody;

  if (body.action === 'receive') return handleReceive(req, res, session.clientId, existing, body.items);
  if (body.action === 'order') return handleSimpleTransition(req, res, session.clientId, 'Draft', 'Ordered');
  if (body.action === 'cancel') return handleCancel(req, res, session.clientId, existing);

  // Plain edit — only while still Draft, matching Quotation's own
  // status-lock convention (editing a document already sent to a supplier
  // would silently diverge from what they were actually asked to fulfil).
  if (existing.status !== 'Draft') {
    return res.status(400).json({ error: 'Only a Draft purchase order can be edited' });
  }

  const update: Record<string, unknown> = {};
  if (body.notes !== undefined) update.notes = body.notes;
  if (body.expectedDate !== undefined) update.expectedDate = body.expectedDate ? new Date(body.expectedDate) : undefined;

  if (body.items !== undefined) {
    if (body.items.length === 0) return res.status(400).json({ error: 'At least one item is required' });
    for (const line of body.items) {
      if (!line.partId || !line.quantity || line.quantity <= 0 || line.unitCost == null || line.unitCost < 0) {
        return res.status(400).json({ error: 'Each item requires a partId, a positive quantity, and a non-negative unitCost' });
      }
    }
    const parts = await Part.find({ _id: { $in: body.items.map((i) => i.partId) }, clientId: session.clientId }).lean();
    const partById = new Map(parts.map((p) => [p._id.toString(), p]));
    const lines: { partId: string; name: string; quantity: number; unitCost: number }[] = [];
    let subtotal = 0;
    for (const line of body.items) {
      const part = partById.get(line.partId!);
      if (!part) return res.status(400).json({ error: `Unknown part: ${line.partId}` });
      lines.push({ partId: part._id.toString(), name: part.name, quantity: line.quantity!, unitCost: line.unitCost! });
      subtotal += line.quantity! * line.unitCost!;
    }
    update.items = lines;
    update.subtotal = Math.round(subtotal * 100) / 100;
    update.total = update.subtotal;
    // Safe to mirror straight onto balance — payments are only ever
    // recordable once a PO leaves Draft (see purchaseOrderPayments.ts), so
    // paidAmount is guaranteed 0 here.
    update.balance = update.total;
  }

  const updated = (await PurchaseOrder.findOneAndUpdate({ _id: id, clientId: session.clientId, status: 'Draft' }, update, {
    returnDocument: 'after',
  }).lean()) as PurchaseOrderDoc | null;
  if (!updated) return res.status(400).json({ error: 'This purchase order was no longer Draft' });

  const supplier = (await Supplier.findById(updated.supplierId).lean()) as SupplierDoc | null;
  return res.status(200).json({ purchaseOrder: serializePurchaseOrder(updated, supplier?.name) });
}

async function handleSimpleTransition(
  req: VercelRequest,
  res: VercelResponse,
  clientId: string,
  fromStatus: string,
  toStatus: string
) {
  const { id } = req.query as { id: string };
  const updated = (await PurchaseOrder.findOneAndUpdate(
    { _id: id, clientId, status: fromStatus },
    { status: toStatus },
    { returnDocument: 'after' }
  ).lean()) as PurchaseOrderDoc | null;
  if (!updated) return res.status(400).json({ error: `This purchase order is no longer ${fromStatus}` });

  const supplier = (await Supplier.findById(updated.supplierId).lean()) as SupplierDoc | null;
  return res.status(200).json({ purchaseOrder: serializePurchaseOrder(updated, supplier?.name) });
}

async function handleCancel(req: VercelRequest, res: VercelResponse, clientId: string, existing: PurchaseOrderDoc) {
  const { id } = req.query as { id: string };
  if (existing.status !== 'Draft' && existing.status !== 'Ordered') {
    return res.status(400).json({ error: 'Only a Draft or Ordered purchase order can be cancelled' });
  }
  const updated = (await PurchaseOrder.findOneAndUpdate(
    { _id: id, clientId, status: existing.status },
    { status: 'Cancelled' },
    { returnDocument: 'after' }
  ).lean()) as PurchaseOrderDoc | null;
  if (!updated) return res.status(400).json({ error: 'This purchase order changed status — refresh and try again' });

  const supplier = (await Supplier.findById(updated.supplierId).lean()) as SupplierDoc | null;
  return res.status(200).json({ purchaseOrder: serializePurchaseOrder(updated, supplier?.name) });
}

// Real stock increment, atomically — the receiving mirror of api/sales/index.ts's
// decrement, and the direct fix for Supplier.openOrders/lastOrder/onTime
// having been dead decorative fields since the original migration (now
// derived live from real PurchaseOrder documents, see api/suppliers/index.ts).
//
// Supports partial receiving: `items` names how much of each line arrived
// THIS delivery (defaulting to a line's full remaining quantity when
// omitted, so the existing single-click "Receive" flow still works
// unchanged for the common full-delivery case). A GoodsReceivedNote is
// created for every receive call — the real per-delivery record — and the
// PO's status reflects whether every line is now fully received.
async function handleReceive(
  req: VercelRequest,
  res: VercelResponse,
  clientId: string,
  existing: PurchaseOrderDoc,
  requestedItems: UpdateLine[] | undefined
) {
  const { id } = req.query as { id: string };
  if (existing.status !== 'Ordered' && existing.status !== 'Partially Received') {
    return res.status(400).json({ error: 'Only an Ordered or Partially Received purchase order can be received' });
  }

  const requestedByPart = new Map((requestedItems ?? []).filter((l) => l.partId).map((l) => [l.partId!, l.quantity]));

  const receiveLines: { partId: string; name: string; quantityReceived: number }[] = [];
  for (const line of existing.items) {
    const alreadyReceived = effectiveReceivedQuantity(line, existing.status);
    const remaining = line.quantity - alreadyReceived;
    if (remaining <= 0) continue;
    // Omitted from the request body ⇒ receive everything still outstanding
    // on this line (today's one-click "Receive" behavior, unchanged).
    const requested = requestedByPart.has(line.partId.toString()) ? requestedByPart.get(line.partId.toString()) : remaining;
    if (!requested || requested <= 0) continue;
    if (requested > remaining) {
      return res.status(400).json({ error: `Cannot receive ${requested} of "${line.name}" — only ${remaining} still outstanding` });
    }
    receiveLines.push({ partId: line.partId.toString(), name: line.name, quantityReceived: requested });
  }
  if (receiveLines.length === 0) {
    return res.status(400).json({ error: 'Nothing to receive — specify a quantity for at least one outstanding line' });
  }

  const dbSession = await mongoose.startSession();
  try {
    let updated: PurchaseOrderDoc | undefined;
    await dbSession.withTransaction(async () => {
      const receivedByPart = new Map(receiveLines.map((l) => [l.partId, l.quantityReceived]));
      for (const line of receiveLines) {
        await Part.updateOne({ _id: line.partId, clientId }, { $inc: { stock: line.quantityReceived } }, { session: dbSession });
      }

      const newItems = existing.items.map((line) => {
        const delta = receivedByPart.get(line.partId.toString()) ?? 0;
        return { ...line, receivedQuantity: effectiveReceivedQuantity(line, existing.status) + delta };
      });
      const fullyReceived = newItems.every((l) => l.receivedQuantity >= l.quantity);
      const receivedAt = new Date();

      const order = await PurchaseOrder.findOneAndUpdate(
        { _id: id, clientId, status: existing.status },
        { items: newItems, status: fullyReceived ? 'Received' : 'Partially Received', receivedAt },
        { session: dbSession, returnDocument: 'after' }
      );
      if (!order) {
        // Status changed by a concurrent request — abort the whole
        // transaction, including the stock increments just made.
        throw Object.assign(new Error('This purchase order changed status — refresh and try again'), { statusCode: 400 });
      }

      const grnNumber = await generateSequentialNumber(GoodsReceivedNote, clientId, 'grnNumber', 'grn');
      await GoodsReceivedNote.create(
        [{ clientId, grnNumber, purchaseOrderId: id, supplierId: existing.supplierId, items: receiveLines }],
        { session: dbSession }
      );

      updated = order.toObject() as PurchaseOrderDoc;
    });

    const supplier = (await Supplier.findById(updated!.supplierId).lean()) as SupplierDoc | null;
    return res.status(200).json({ purchaseOrder: serializePurchaseOrder(updated!, supplier?.name) });
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
    const message = err instanceof Error ? err.message : 'Failed to receive purchase order';
    return res.status(statusCode).json({ error: message });
  } finally {
    await dbSession.endSession();
  }
}

import type { VercelRequest, VercelResponse } from '@vercel/node';
import mongoose from 'mongoose';
import { connectToDatabase } from '../../db.js';
import { PurchaseOrder, PurchaseOrderDoc } from '../../models/PurchaseOrder.js';
import { Part } from '../../models/Part.js';
import { Supplier, SupplierDoc } from '../../models/Supplier.js';
import { requireTenantPermission } from '../../auth.js';
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

  if (body.action === 'receive') return handleReceive(req, res, session.clientId, existing);
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
async function handleReceive(req: VercelRequest, res: VercelResponse, clientId: string, existing: PurchaseOrderDoc) {
  const { id } = req.query as { id: string };
  if (existing.status !== 'Ordered') {
    return res.status(400).json({ error: 'Only an Ordered purchase order can be received' });
  }

  const dbSession = await mongoose.startSession();
  try {
    let updated: PurchaseOrderDoc | undefined;
    await dbSession.withTransaction(async () => {
      for (const line of existing.items) {
        await Part.updateOne({ _id: line.partId, clientId }, { $inc: { stock: line.quantity } }, { session: dbSession });
      }
      const receivedAt = new Date();
      const order = await PurchaseOrder.findOneAndUpdate(
        { _id: id, clientId, status: 'Ordered' },
        { status: 'Received', receivedAt },
        { session: dbSession, returnDocument: 'after' }
      );
      if (!order) {
        // Already received (or cancelled) by a concurrent request — abort
        // the whole transaction, including the stock increments just made.
        throw Object.assign(new Error('This purchase order was already received'), { statusCode: 400 });
      }
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

import type { VercelRequest, VercelResponse } from '@vercel/node';
import mongoose from 'mongoose';
import { connectToDatabase } from '../../../db.js';
import { SalesOrder, SalesOrderDoc } from '../../../models/SalesOrder.js';
import { DeliveryNote, DeliveryNoteDoc } from '../../../models/DeliveryNote.js';
import { Sale } from '../../../models/Sale.js';
import { Part } from '../../../models/Part.js';
import { Customer, CustomerDoc } from '../../../models/Customer.js';
import { Client, ClientDoc } from '../../../models/Client.js';
import { requireTenantPermission } from '../../../auth.js';
import { generateSequentialNumber } from '../../../numbering.js';
import { computeTotals, getTaxRatePct } from '../../../accounting.js';
import { serializeSalesOrder, serializeDeliveryNote } from '../../../serializers.js';

interface FulfillLine {
  partId?: string;
  quantity?: number;
}

interface FulfillBody {
  items?: FulfillLine[];
  // Sales Module Phase 5 — proof of delivery for the non-DAG (atomic) path;
  // the DAG path's equivalent capture point is delivery-notes/[id]/confirm.ts.
  receiverName?: string;
  receiverPhone?: string;
  signatureDataUrl?: string;
  photoDataUrl?: string;
}

// Same convention/cap as Client.branding.logoDataUrl (tenant/settings.ts).
const MAX_PROOF_DATA_URL_LENGTH = 2_000_000;

// A note not yet Confirmed or Cancelled — Picked/Packed (Sales Module
// Phase 5) still hold their staged quantity out of "outstanding," same as
// Pending always has.
const UNCONFIRMED_STATUSES = ['Pending', 'Picked', 'Packed'];

// The sales-side mirror of purchase-orders/[id].ts's handleReceive: decrements
// real stock, creates a DeliveryNote (the goods-issued record — the sales-side
// GoodsReceivedNote), and — so this stays visible in the sales reporting/
// inventory/transactions views that already exist rather than needing new
// wiring — also creates a real Sale for the delivered portion, the same
// model instant POS checkout already writes. Supports partial fulfillment,
// same "omit a line's quantity to deliver everything still outstanding on
// it" convention as the receiving flow.
//
// ERP-Phase 4: when Client.requireDeliveryConfirm is on, this endpoint only
// prepares a Pending DeliveryNote (the "DAG") instead — everything below
// this point (stock decrement, SalesOrder update, Sale creation) moves to
// delivery-notes/[id]/confirm.ts, a separate explicit step. Off (the
// default), this route is 100% unchanged from before this phase.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'sales:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing sales order id' });

  const { items: requestedItems, receiverName, receiverPhone, signatureDataUrl, photoDataUrl } = (req.body ?? {}) as FulfillBody;
  if (signatureDataUrl && signatureDataUrl.length > MAX_PROOF_DATA_URL_LENGTH) {
    return res.status(400).json({ error: 'Signature image is too large' });
  }
  if (photoDataUrl && photoDataUrl.length > MAX_PROOF_DATA_URL_LENGTH) {
    return res.status(400).json({ error: 'Photo is too large' });
  }

  await connectToDatabase();

  const existing = (await SalesOrder.findOne({ _id: id, clientId: session.clientId }).lean()) as SalesOrderDoc | null;
  if (!existing) return res.status(404).json({ error: 'Sales order not found' });
  if (existing.status !== 'Confirmed' && existing.status !== 'Partially Fulfilled') {
    return res.status(400).json({ error: 'Only a Confirmed or Partially Fulfilled sales order can be fulfilled' });
  }

  const client = (await Client.findById(session.clientId).select('requireDeliveryConfirm').lean()) as ClientDoc | null;
  const dagMode = !!client?.requireDeliveryConfirm;

  // In DAG mode, quantities already staged on an unconfirmed Pending
  // DeliveryNote for this order haven't touched deliveredQuantity yet —
  // without this, two Pending DAGs could each claim the same outstanding
  // units and both later confirm, over-delivering. Not needed off-mode:
  // nothing can be Pending there, this branch is the only Pending creator.
  const pendingByPart = new Map<string, number>();
  if (dagMode) {
    const pendingNotes = (await DeliveryNote.find({ salesOrderId: id, clientId: session.clientId, status: { $in: UNCONFIRMED_STATUSES } })
      .select('items')
      .lean()) as DeliveryNoteDoc[];
    for (const note of pendingNotes) {
      for (const item of note.items) {
        const key = item.partId.toString();
        pendingByPart.set(key, (pendingByPart.get(key) ?? 0) + item.quantityDelivered);
      }
    }
  }

  const requestedByPart = new Map((requestedItems ?? []).filter((l) => l.partId).map((l) => [l.partId!, l.quantity]));

  const fulfillLines: { partId: string; name: string; unitPrice: number; quantity: number; isManualEntry: boolean }[] = [];
  for (const line of existing.items) {
    const remaining = line.quantity - (line.deliveredQuantity ?? 0) - (pendingByPart.get(line.partId.toString()) ?? 0);
    if (remaining <= 0) continue;
    const requested = requestedByPart.has(line.partId.toString()) ? requestedByPart.get(line.partId.toString()) : remaining;
    if (!requested || requested <= 0) continue;
    if (requested > remaining) {
      return res.status(400).json({ error: `Cannot deliver ${requested} of "${line.name}" — only ${remaining} still outstanding (accounting for anything already staged on a pending delivery)` });
    }
    // Orders written before per-line Dis1/Dis2 existed have no lineTotal —
    // falls back to the plain gross (no discount), byte-identical to before
    // these fields existed. Prorating lineTotal/quantity onto just the
    // quantity delivered now keeps a partially-delivered discounted line's
    // resulting Sale.total consistent with what the order itself quoted,
    // instead of silently dropping the line discount at delivery time.
    const effectiveUnitPrice = line.quantity > 0 ? Math.round(((line.lineTotal ?? line.quantity * line.unitPrice) / line.quantity) * 100) / 100 : line.unitPrice;
    fulfillLines.push({ partId: line.partId.toString(), name: line.name, unitPrice: effectiveUnitPrice, quantity: requested, isManualEntry: line.isManualEntry ?? false });
  }
  if (fulfillLines.length === 0) {
    return res.status(400).json({ error: 'Nothing to deliver — specify a quantity for at least one outstanding line' });
  }

  if (dagMode) {
    const deliveryNoteNumber = await generateSequentialNumber(DeliveryNote, session.clientId, 'deliveryNoteNumber', 'deliveryNote');
    const [note] = await DeliveryNote.create([
      {
        clientId: session.clientId,
        deliveryNoteNumber,
        salesOrderId: id,
        customerId: existing.customerId,
        items: fulfillLines.map((l) => ({ partId: l.partId, name: l.name, quantityDelivered: l.quantity })),
        status: 'Pending',
      },
    ]);
    const customer = (await Customer.findById(existing.customerId).select('name').lean()) as CustomerDoc | null;
    return res.status(201).json({
      salesOrder: serializeSalesOrder(existing, customer?.name),
      deliveryNote: serializeDeliveryNote(note.toObject() as DeliveryNoteDoc, existing.salesOrderNumber, customer?.name),
    });
  }

  // Same discount the order was placed under (snapshotted, so it can't
  // drift if the customer's discount changes later — same reasoning as
  // Quotation -> CustomerInvoice conversion), but the CURRENT tax rate,
  // consistent with every other tax-computing route in this codebase.
  const taxRatePct = await getTaxRatePct(session.clientId);
  const { subtotal: saleSubtotal, taxAmount: saleTax, total: saleTotal } = computeTotals(
    fulfillLines.map((l) => ({ description: l.name, quantity: l.quantity, unitPrice: l.unitPrice })),
    existing.discountPct,
    taxRatePct
  );

  const dbSession = await mongoose.startSession();
  try {
    let updated: SalesOrderDoc | undefined;
    let createdNote: DeliveryNoteDoc | undefined;
    await dbSession.withTransaction(async () => {
      // Stock Reservation (Sales Module Phase 4): "reserved" stock is
      // derived live from quantity - deliveredQuantity (see
      // stockReservation.ts), never a separately-maintained counter — so
      // bumping deliveredQuantity below (via the SalesOrder update) already
      // IS the reservation release. No extra bookkeeping needed here.
      for (const line of fulfillLines) {
        if (line.isManualEntry) continue; // nothing in the catalog to decrement
        const part = await Part.findOneAndUpdate(
          { _id: line.partId, clientId: session.clientId, stock: { $gte: line.quantity } },
          { $inc: { stock: -line.quantity } },
          { session: dbSession }
        );
        if (!part) {
          throw Object.assign(new Error(`Not enough stock for "${line.name}" to deliver ${line.quantity}`), { statusCode: 400 });
        }
      }

      const deliveredByPart = new Map(fulfillLines.map((l) => [l.partId, l.quantity]));
      const newItems = existing.items.map((line) => {
        const delta = deliveredByPart.get(line.partId.toString()) ?? 0;
        return { ...line, deliveredQuantity: (line.deliveredQuantity ?? 0) + delta };
      });
      const fullyDelivered = newItems.every((l) => l.deliveredQuantity >= l.quantity);

      const order = await SalesOrder.findOneAndUpdate(
        { _id: id, clientId: session.clientId, status: existing.status },
        { items: newItems, status: fullyDelivered ? 'Fulfilled' : 'Partially Fulfilled' },
        { session: dbSession, returnDocument: 'after' }
      );
      if (!order) {
        throw Object.assign(new Error('This sales order changed status — refresh and try again'), { statusCode: 400 });
      }

      const deliveryNoteNumber = await generateSequentialNumber(DeliveryNote, session.clientId, 'deliveryNoteNumber', 'deliveryNote');
      const [note] = await DeliveryNote.create(
        [
          {
            clientId: session.clientId,
            deliveryNoteNumber,
            salesOrderId: id,
            customerId: existing.customerId,
            items: fulfillLines.map((l) => ({ partId: l.partId, name: l.name, quantityDelivered: l.quantity })),
            confirmedAt: new Date(),
            receiverName,
            receiverPhone,
            signatureDataUrl,
            photoDataUrl,
          },
        ],
        { session: dbSession }
      );
      createdNote = note.toObject() as DeliveryNoteDoc;

      // A real Sale for the delivered portion, at this order's agreed
      // prices (and discount/tax) — so it appears in Sales history /
      // InventoryReport / Transactions the same way an instant POS
      // checkout would, with no separate reporting path needed for
      // sales-order-originated revenue.
      await Sale.create(
        [
          {
            clientId: session.clientId,
            items: fulfillLines.map((l) => ({ partId: l.partId, name: l.name, price: l.unitPrice, qty: l.quantity })),
            subtotal: saleSubtotal,
            tax: saleTax,
            total: saleTotal,
            branchId: existing.branchId,
          },
        ],
        { session: dbSession }
      );

      updated = order.toObject() as SalesOrderDoc;
    });

    if (!updated || !createdNote) throw new Error('Transaction completed without producing a result');
    const customer = (await Customer.findById(updated.customerId).select('name').lean()) as CustomerDoc | null;
    return res.status(200).json({
      salesOrder: serializeSalesOrder(updated, customer?.name),
      deliveryNote: serializeDeliveryNote(createdNote, updated.salesOrderNumber, customer?.name),
    });
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
    const message = err instanceof Error ? err.message : 'Failed to fulfill sales order';
    return res.status(statusCode).json({ error: message });
  } finally {
    await dbSession.endSession();
  }
}

import type { VercelRequest, VercelResponse } from '@vercel/node';
import mongoose from 'mongoose';
import { connectToDatabase } from '../../../db.js';
import { DeliveryNote, DeliveryNoteDoc } from '../../../models/DeliveryNote.js';
import { SalesOrder, SalesOrderDoc } from '../../../models/SalesOrder.js';
import { Sale } from '../../../models/Sale.js';
import { Part } from '../../../models/Part.js';
import { Customer, CustomerDoc } from '../../../models/Customer.js';
import { requireTenantPermission } from '../../../auth.js';
import { computeTotals, getTaxRatePct } from '../../../accounting.js';
import { serializeSalesOrder, serializeDeliveryNote } from '../../../serializers.js';

interface ConfirmDeliveryBody {
  receiverName?: string;
  receiverPhone?: string;
  signatureDataUrl?: string;
  photoDataUrl?: string;
}

// Small base64 data: URLs stored directly on the document — same convention
// and cap as Client.branding.logoDataUrl (tenant/settings.ts).
const MAX_PROOF_DATA_URL_LENGTH = 2_000_000;

// Sales Module Phase 5 — a note can now be confirmed directly from Pending
// (unchanged, byte-identical to before this phase), or after optionally
// progressing through Picked/Packed via delivery-notes/[id].ts.
const CONFIRMABLE_STATUSES = ['Pending', 'Picked', 'Packed'];

// ERP-Phase 4 — the second half of the DAG split: this is where a Pending
// DeliveryNote actually becomes real. Does exactly what
// sales-orders/[id]/fulfill.ts used to do atomically in one step (decrement
// stock, update the SalesOrder, create a Sale) — same permission
// ('sales:manage', the delivery is still a sales action), same atomic
// transaction shape. Re-validates against the SalesOrder's CURRENT
// deliveredQuantity (not what it was when the DAG was created) since time
// may have passed and another DeliveryNote could have confirmed first.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'sales:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing delivery note id' });

  const { receiverName, receiverPhone, signatureDataUrl, photoDataUrl } = (req.body ?? {}) as ConfirmDeliveryBody;
  if (signatureDataUrl && signatureDataUrl.length > MAX_PROOF_DATA_URL_LENGTH) {
    return res.status(400).json({ error: 'Signature image is too large' });
  }
  if (photoDataUrl && photoDataUrl.length > MAX_PROOF_DATA_URL_LENGTH) {
    return res.status(400).json({ error: 'Photo is too large' });
  }

  await connectToDatabase();

  const note = (await DeliveryNote.findOne({ _id: id, clientId: session.clientId }).lean()) as DeliveryNoteDoc | null;
  if (!note) return res.status(404).json({ error: 'Delivery note not found' });
  if (!CONFIRMABLE_STATUSES.includes(note.status)) {
    return res.status(400).json({ error: 'Only a Pending, Picked, or Packed delivery note can be confirmed' });
  }

  const order = (await SalesOrder.findOne({ _id: note.salesOrderId, clientId: session.clientId }).lean()) as SalesOrderDoc | null;
  if (!order) return res.status(404).json({ error: 'Linked sales order not found' });
  if (order.status !== 'Confirmed' && order.status !== 'Partially Fulfilled') {
    return res.status(400).json({ error: 'The linked sales order is no longer open for delivery' });
  }

  const orderLineByPart = new Map(order.items.map((l) => [l.partId.toString(), l]));
  for (const item of note.items) {
    const line = orderLineByPart.get(item.partId.toString());
    const remaining = line ? line.quantity - (line.deliveredQuantity ?? 0) : 0;
    if (item.quantityDelivered > remaining) {
      return res.status(400).json({
        error: `"${item.name}" changed since this delivery was prepared — only ${remaining} still outstanding, this note has ${item.quantityDelivered}. Cancel it and create a new one.`,
      });
    }
  }

  // Orders written before per-line Dis1/Dis2 existed have no lineTotal —
  // falls back to the plain gross (no discount), byte-identical to before
  // these fields existed. Prorating lineTotal/quantity onto just the
  // quantity delivered now (same technique as fulfill.ts's non-DAG path)
  // keeps a partially-delivered discounted line's resulting Sale.total
  // consistent with what the order itself quoted.
  function effectiveUnitPrice(line: SalesOrderDoc['items'][number] | undefined): number {
    if (!line) return 0;
    if (line.quantity <= 0) return line.unitPrice;
    return Math.round(((line.lineTotal ?? line.quantity * line.unitPrice) / line.quantity) * 100) / 100;
  }

  const taxRatePct = await getTaxRatePct(session.clientId);
  const { subtotal: saleSubtotal, taxAmount: saleTax, total: saleTotal } = computeTotals(
    note.items.map((i) => ({ description: i.name, quantity: i.quantityDelivered, unitPrice: effectiveUnitPrice(orderLineByPart.get(i.partId.toString())) })),
    order.discountPct,
    taxRatePct
  );

  const dbSession = await mongoose.startSession();
  try {
    let updatedOrder: SalesOrderDoc | undefined;
    let confirmedNote: DeliveryNoteDoc | undefined;
    await dbSession.withTransaction(async () => {
      // Stock Reservation (Sales Module Phase 4): reserved stock is derived
      // live from quantity - deliveredQuantity (stockReservation.ts), never
      // a stored counter — bumping deliveredQuantity below (via the
      // SalesOrder update) already IS the reservation release.
      for (const item of note.items) {
        if (orderLineByPart.get(item.partId.toString())?.isManualEntry) continue; // nothing in the catalog to decrement
        const part = await Part.findOneAndUpdate(
          { _id: item.partId, clientId: session.clientId, stock: { $gte: item.quantityDelivered } },
          { $inc: { stock: -item.quantityDelivered } },
          { session: dbSession }
        );
        if (!part) {
          throw Object.assign(new Error(`Not enough stock for "${item.name}" to deliver ${item.quantityDelivered}`), { statusCode: 400 });
        }
      }

      const deliveredByPart = new Map(note.items.map((i) => [i.partId.toString(), i.quantityDelivered]));
      const newItems = order.items.map((line) => {
        const delta = deliveredByPart.get(line.partId.toString()) ?? 0;
        return { ...line, deliveredQuantity: (line.deliveredQuantity ?? 0) + delta };
      });
      const fullyDelivered = newItems.every((l) => l.deliveredQuantity >= l.quantity);

      const orderResult = await SalesOrder.findOneAndUpdate(
        { _id: note.salesOrderId, clientId: session.clientId, status: order.status },
        { items: newItems, status: fullyDelivered ? 'Fulfilled' : 'Partially Fulfilled' },
        { session: dbSession, returnDocument: 'after' }
      );
      if (!orderResult) {
        throw Object.assign(new Error('This sales order changed status — refresh and try again'), { statusCode: 400 });
      }

      const noteResult = await DeliveryNote.findOneAndUpdate(
        { _id: id, clientId: session.clientId, status: note.status },
        { status: 'Confirmed', confirmedAt: new Date(), receiverName, receiverPhone, signatureDataUrl, photoDataUrl },
        { session: dbSession, returnDocument: 'after' }
      );
      if (!noteResult) {
        throw Object.assign(new Error('This delivery note changed status — refresh and try again'), { statusCode: 400 });
      }

      // Same "a real Sale so it appears in Sales history / InventoryReport /
      // Transactions" reasoning as the non-DAG path in fulfill.ts.
      await Sale.create(
        [
          {
            clientId: session.clientId,
            items: note.items.map((i) => ({ partId: i.partId, name: i.name, price: effectiveUnitPrice(orderLineByPart.get(i.partId.toString())), qty: i.quantityDelivered })),
            subtotal: saleSubtotal,
            tax: saleTax,
            total: saleTotal,
            branchId: order.branchId,
          },
        ],
        { session: dbSession }
      );

      updatedOrder = orderResult.toObject() as SalesOrderDoc;
      confirmedNote = noteResult.toObject() as DeliveryNoteDoc;
    });
    if (!updatedOrder || !confirmedNote) throw new Error('Transaction completed without producing a result');

    const customer = (await Customer.findById(updatedOrder.customerId).select('name').lean()) as CustomerDoc | null;
    return res.status(200).json({
      salesOrder: serializeSalesOrder(updatedOrder, customer?.name),
      deliveryNote: serializeDeliveryNote(confirmedNote, updatedOrder.salesOrderNumber, customer?.name),
    });
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
    const message = err instanceof Error ? err.message : 'Failed to confirm delivery';
    return res.status(statusCode).json({ error: message });
  } finally {
    await dbSession.endSession();
  }
}

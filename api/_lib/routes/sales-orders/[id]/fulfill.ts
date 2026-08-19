import type { VercelRequest, VercelResponse } from '@vercel/node';
import mongoose from 'mongoose';
import { connectToDatabase } from '../../../db.js';
import { SalesOrder, SalesOrderDoc } from '../../../models/SalesOrder.js';
import { DeliveryNote } from '../../../models/DeliveryNote.js';
import { Sale } from '../../../models/Sale.js';
import { Part } from '../../../models/Part.js';
import { Customer, CustomerDoc } from '../../../models/Customer.js';
import { requireTenantPermission } from '../../../auth.js';
import { generateSequentialNumber } from '../../../numbering.js';
import { computeTotals, getTaxRatePct } from '../../../accounting.js';
import { serializeSalesOrder } from '../../../serializers.js';

interface FulfillLine {
  partId?: string;
  quantity?: number;
}

interface FulfillBody {
  items?: FulfillLine[];
}

// The sales-side mirror of purchase-orders/[id].ts's handleReceive: decrements
// real stock, creates a DeliveryNote (the goods-issued record — the sales-side
// GoodsReceivedNote), and — so this stays visible in the sales reporting/
// inventory/transactions views that already exist rather than needing new
// wiring — also creates a real Sale for the delivered portion, the same
// model instant POS checkout already writes. Supports partial fulfillment,
// same "omit a line's quantity to deliver everything still outstanding on
// it" convention as the receiving flow.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'sales:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing sales order id' });

  const { items: requestedItems } = (req.body ?? {}) as FulfillBody;

  await connectToDatabase();

  const existing = (await SalesOrder.findOne({ _id: id, clientId: session.clientId }).lean()) as SalesOrderDoc | null;
  if (!existing) return res.status(404).json({ error: 'Sales order not found' });
  if (existing.status !== 'Confirmed' && existing.status !== 'Partially Fulfilled') {
    return res.status(400).json({ error: 'Only a Confirmed or Partially Fulfilled sales order can be fulfilled' });
  }

  const requestedByPart = new Map((requestedItems ?? []).filter((l) => l.partId).map((l) => [l.partId!, l.quantity]));

  const fulfillLines: { partId: string; name: string; unitPrice: number; quantity: number }[] = [];
  for (const line of existing.items) {
    const remaining = line.quantity - (line.deliveredQuantity ?? 0);
    if (remaining <= 0) continue;
    const requested = requestedByPart.has(line.partId.toString()) ? requestedByPart.get(line.partId.toString()) : remaining;
    if (!requested || requested <= 0) continue;
    if (requested > remaining) {
      return res.status(400).json({ error: `Cannot deliver ${requested} of "${line.name}" — only ${remaining} still outstanding` });
    }
    fulfillLines.push({ partId: line.partId.toString(), name: line.name, unitPrice: line.unitPrice, quantity: requested });
  }
  if (fulfillLines.length === 0) {
    return res.status(400).json({ error: 'Nothing to deliver — specify a quantity for at least one outstanding line' });
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
    await dbSession.withTransaction(async () => {
      for (const line of fulfillLines) {
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
      await DeliveryNote.create(
        [
          {
            clientId: session.clientId,
            deliveryNoteNumber,
            salesOrderId: id,
            customerId: existing.customerId,
            items: fulfillLines.map((l) => ({ partId: l.partId, name: l.name, quantityDelivered: l.quantity })),
          },
        ],
        { session: dbSession }
      );

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

    const customer = (await Customer.findById(updated!.customerId).select('name').lean()) as CustomerDoc | null;
    return res.status(200).json({ salesOrder: serializeSalesOrder(updated!, customer?.name) });
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
    const message = err instanceof Error ? err.message : 'Failed to fulfill sales order';
    return res.status(statusCode).json({ error: message });
  } finally {
    await dbSession.endSession();
  }
}

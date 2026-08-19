import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { DeliveryNote, DeliveryNoteDoc } from '../../models/DeliveryNote.js';
import { SalesOrder, SalesOrderDoc } from '../../models/SalesOrder.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeDeliveryNote } from '../../serializers.js';

// Read-only — a Delivery Note is only ever created as a side effect of
// fulfilling a sales order (sales-orders/[id]/fulfill.ts), never entered
// directly, same reasoning as goods-received-notes/index.ts.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'sales:view');
  if (!session) return;

  await connectToDatabase();
  const { salesOrderId } = req.query;
  const filter: Record<string, unknown> = { clientId: session.clientId };
  if (typeof salesOrderId === 'string') filter.salesOrderId = salesOrderId;

  const notes = (await DeliveryNote.find(filter).sort({ createdAt: -1 }).lean()) as DeliveryNoteDoc[];
  const salesOrderIds = [...new Set(notes.map((n) => n.salesOrderId.toString()))];
  const customerIds = [...new Set(notes.map((n) => n.customerId.toString()))];
  const [orders, customers] = await Promise.all([
    SalesOrder.find({ _id: { $in: salesOrderIds } }).select('salesOrderNumber').lean() as Promise<SalesOrderDoc[]>,
    Customer.find({ _id: { $in: customerIds } }).select('name').lean() as Promise<CustomerDoc[]>,
  ]);
  const orderNumberById = new Map(orders.map((o) => [o._id.toString(), o.salesOrderNumber]));
  const customerNameById = new Map(customers.map((c) => [c._id.toString(), c.name]));

  return res.status(200).json({
    deliveryNotes: notes.map((n) =>
      serializeDeliveryNote(n, orderNumberById.get(n.salesOrderId.toString()), customerNameById.get(n.customerId.toString()))
    ),
  });
}

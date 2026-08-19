import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { SalesOrder, SalesOrderDoc } from '../../models/SalesOrder.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeSalesOrder } from '../../serializers.js';

interface UpdateSalesOrderBody {
  action?: 'cancel';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'sales:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing sales order id' });

  const { action } = (req.body ?? {}) as UpdateSalesOrderBody;
  if (action !== 'cancel') return res.status(400).json({ error: 'action must be "cancel"' });

  await connectToDatabase();

  const existing = (await SalesOrder.findOne({ _id: id, clientId: session.clientId }).lean()) as SalesOrderDoc | null;
  if (!existing) return res.status(404).json({ error: 'Sales order not found' });
  if (existing.status !== 'Confirmed') {
    return res.status(400).json({ error: 'Only a Confirmed sales order with nothing delivered yet can be cancelled' });
  }

  const order = (await SalesOrder.findOneAndUpdate(
    { _id: id, clientId: session.clientId, status: 'Confirmed' },
    { status: 'Cancelled' },
    { returnDocument: 'after' }
  ).lean()) as SalesOrderDoc;

  const customer = (await Customer.findById(order.customerId).select('name').lean()) as CustomerDoc | null;
  return res.status(200).json({ salesOrder: serializeSalesOrder(order, customer?.name) });
}

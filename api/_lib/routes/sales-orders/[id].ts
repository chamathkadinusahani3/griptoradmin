import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { SalesOrder, SalesOrderDoc } from '../../models/SalesOrder.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeSalesOrder } from '../../serializers.js';
import { respondToApprovalGate } from '../../approvalGate.js';

interface UpdateSalesOrderBody {
  action?: 'cancel' | 'approve' | 'reject';
  rejectionReason?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing sales order id' });

  const { action, rejectionReason } = (req.body ?? {}) as UpdateSalesOrderBody;

  if (action === 'approve' || action === 'reject') return handleApproval(req, res, id, action, rejectionReason);
  if (action === 'cancel') return handleCancel(req, res, id);
  return res.status(400).json({ error: 'action must be "cancel", "approve", or "reject"' });
}

// Deliberately a stricter, standalone-permission gate (same reasoning as
// purchase-requisitions/[id].ts) — a staff member who can create sales
// orders (sales:manage) should not also be able to approve their own,
// otherwise the approval gate is pointless.
async function handleApproval(req: VercelRequest, res: VercelResponse, id: string, action: 'approve' | 'reject', rejectionReason?: string) {
  const session = await requireTenantPermission(req, res, 'approvals:respond');
  if (!session) return;

  await connectToDatabase();

  const existing = (await SalesOrder.findOne({ _id: id, clientId: session.clientId }).lean()) as SalesOrderDoc | null;
  if (!existing) return res.status(404).json({ error: 'Sales order not found' });
  if (existing.status !== 'Pending Approval') {
    return res.status(400).json({ error: 'Only a Pending Approval sales order can be approved or rejected' });
  }
  const trimmedRejectionReason = rejectionReason?.trim();
  if (action === 'reject' && !trimmedRejectionReason) {
    return res.status(400).json({ error: 'A rejection reason is required' });
  }

  const order = await respondToApprovalGate<SalesOrderDoc>(
    SalesOrder,
    { _id: id, clientId: session.clientId },
    'Pending Approval',
    action === 'approve' ? 'Confirmed' : 'Cancelled',
    session.sub,
    action === 'reject' ? trimmedRejectionReason : undefined
  );
  if (!order) return res.status(400).json({ error: 'This sales order changed status — refresh and try again' });

  const customer = (await Customer.findById(order.customerId).select('name').lean()) as CustomerDoc | null;
  return res.status(200).json({ salesOrder: serializeSalesOrder(order, customer?.name) });
}

async function handleCancel(req: VercelRequest, res: VercelResponse, id: string) {
  const session = await requireTenantPermission(req, res, 'sales:manage');
  if (!session) return;

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

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { SalesOrder, SalesOrderDoc } from '../../models/SalesOrder.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { JobCard, JobCardDoc } from '../../models/JobCard.js';
import { Department } from '../../models/Department.js';
import { Salesperson } from '../../models/Salesperson.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeSalesOrder } from '../../serializers.js';
import { respondToApprovalGate } from '../../approvalGate.js';
import { resolveSalesOrderLines, SalesOrderLineBody } from '../../salesOrderResolve.js';

interface UpdateSalesOrderBody {
  action?: 'cancel' | 'approve' | 'reject';
  rejectionReason?: string;
  // Edit fields — only meaningful (and only read) when `action` is omitted.
  // customerId is deliberately NOT accepted here: changing the customer on
  // an existing order would silently invalidate the credit/salesperson
  // attribution already applied at creation, so an edit always keeps the
  // order's original customer.
  branchId?: string;
  salespersonId?: string;
  jobCardId?: string;
  departmentId?: string;
  creditPeriod?: string;
  payType?: 'Cash' | 'Credit';
  scheduledDeliveryDate?: string;
  deliveryMarkingDate?: string;
  deliveryType?: string;
  deliveryName?: string;
  deliveryAddress?: string;
  customerAddress?: string;
  customerTel?: string;
  vatType?: 'Vat' | 'Non Vat';
  vatNumber?: string;
  svatNumber?: string;
  brand?: string;
  items?: SalesOrderLineBody[];
  notes?: string;
  staffNote?: string;
}

const EDITABLE_STATUSES = ['Pending Approval', 'Confirmed'];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing sales order id' });

  const body = (req.body ?? {}) as UpdateSalesOrderBody;
  const { action, rejectionReason } = body;

  if (action === 'approve' || action === 'reject') return handleApproval(req, res, id, action, rejectionReason);
  if (action === 'cancel') return handleCancel(req, res, id);
  if (action) return res.status(400).json({ error: 'action must be "cancel", "approve", or "reject"' });
  // No action supplied — a plain edit of the order's own fields/items,
  // matching Quotation/CustomerInvoice's "PATCH with no action = a field
  // edit" convention.
  return handleEdit(req, res, id, body);
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

// GRIPTOR ERP customization — lets staff correct an order's header fields
// and line items before it's been fulfilled/delivered at all. Reuses the
// EXACT same price list / promotion / stock reservation / discount
// governance / credit limit pipeline as creation (salesOrderResolve.ts),
// rather than a second hand-rolled copy — an edit is validated exactly as
// strictly as a fresh order would be.
async function handleEdit(req: VercelRequest, res: VercelResponse, id: string, body: UpdateSalesOrderBody) {
  const session = await requireTenantPermission(req, res, 'sales:manage');
  if (!session) return;

  await connectToDatabase();

  const existing = (await SalesOrder.findOne({ _id: id, clientId: session.clientId }).lean()) as SalesOrderDoc | null;
  if (!existing) return res.status(404).json({ error: 'Sales order not found' });
  if (!EDITABLE_STATUSES.includes(existing.status)) {
    return res.status(400).json({ error: 'Only a Pending Approval or Confirmed sales order (nothing delivered yet) can be edited' });
  }

  const { items } = body;
  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'At least one item is required' });
  }

  const customer = (await Customer.findOne({ _id: existing.customerId, clientId: session.clientId }).lean()) as CustomerDoc | null;
  if (!customer) return res.status(400).json({ error: 'This order\'s customer no longer exists' });

  const salespersonId = body.salespersonId !== undefined ? body.salespersonId : existing.salespersonId?.toString();
  if (salespersonId) {
    const salesperson = await Salesperson.findOne({ _id: salespersonId, clientId: session.clientId }).lean();
    if (!salesperson) return res.status(400).json({ error: 'Unknown salesperson' });
  }
  const jobCardId = body.jobCardId !== undefined ? body.jobCardId : existing.jobCardId?.toString();
  let jobCardLabel: string | undefined;
  if (jobCardId) {
    const jobCard = (await JobCard.findOne({ _id: jobCardId, clientId: session.clientId }).lean()) as JobCardDoc | null;
    if (!jobCard) return res.status(400).json({ error: 'Unknown job card' });
    jobCardLabel = jobCard.vehicle;
  }
  const departmentId = body.departmentId !== undefined ? body.departmentId : existing.departmentId?.toString();
  let departmentName: string | undefined;
  if (departmentId) {
    const department = (await Department.findOne({ _id: departmentId, clientId: session.clientId }).lean()) as { name: string } | null;
    if (!department) return res.status(400).json({ error: 'Unknown department' });
    departmentName = department.name;
  }

  const vatType = body.vatType ?? existing.vatType ?? 'Non Vat';

  const resolved = await resolveSalesOrderLines({
    session,
    customer,
    requestedBranchId: body.branchId !== undefined ? body.branchId : existing.branchId?.toString(),
    items,
    vatType,
    // This order's OWN current reservation must not count against itself
    // when re-validating its (possibly changed) quantities — see
    // stockReservation.ts's getReservedQtyByPart.
    excludeOrderId: id,
  });
  if (!resolved.ok) return res.status(resolved.status).json({ error: resolved.error });

  const update: Record<string, unknown> = {
    branchId: resolved.branchId,
    salespersonId: salespersonId || undefined,
    jobCardId: jobCardId || undefined,
    departmentId: departmentId || undefined,
    items: resolved.resolvedLines,
    subtotal: resolved.subtotal,
    discountPct: resolved.discountPct,
    discountAmount: resolved.discountAmount,
    taxAmount: resolved.taxAmount,
    total: resolved.total,
    vatType,
  };
  for (const key of ['creditPeriod', 'payType', 'deliveryType', 'deliveryName', 'deliveryAddress', 'customerAddress', 'customerTel', 'vatNumber', 'svatNumber', 'brand', 'notes', 'staffNote'] as const) {
    if (body[key] !== undefined) update[key] = body[key];
  }
  if (body.scheduledDeliveryDate !== undefined) update.scheduledDeliveryDate = body.scheduledDeliveryDate ? new Date(body.scheduledDeliveryDate) : undefined;
  if (body.deliveryMarkingDate !== undefined) update.deliveryMarkingDate = body.deliveryMarkingDate ? new Date(body.deliveryMarkingDate) : undefined;

  // Optimistic concurrency on the order's own status — if someone
  // approved/rejected/cancelled it in the moment between this request's own
  // read above and now, this update is refused rather than silently
  // clobbering that transition.
  const order = (await SalesOrder.findOneAndUpdate(
    { _id: id, clientId: session.clientId, status: existing.status },
    update,
    { returnDocument: 'after' }
  ).lean()) as SalesOrderDoc | null;
  if (!order) return res.status(400).json({ error: 'This sales order changed status — refresh and try again' });

  return res.status(200).json({
    salesOrder: serializeSalesOrder(order, customer.name, jobCardLabel, departmentName),
    creditWarning: resolved.creditWarning,
    discountWarning: resolved.discountWarning,
    appliedPromotions: resolved.appliedPromotions.length > 0 ? resolved.appliedPromotions : undefined,
  });
}

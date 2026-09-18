import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { SalesOrder, SalesOrderDoc } from '../../models/SalesOrder.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { JobCard, JobCardDoc } from '../../models/JobCard.js';
import { Department } from '../../models/Department.js';
import { Salesperson } from '../../models/Salesperson.js';
import { SalespersonAssignment } from '../../models/SalespersonAssignment.js';
import { requireTenantPermission } from '../../auth.js';
import { generateSequentialNumber } from '../../numbering.js';
import { resolveSalesOrderLines, SalesOrderLineBody } from '../../salesOrderResolve.js';
import { serializeSalesOrder } from '../../serializers.js';
import { isDealerPendingApproval } from '../../creditDiscipline.js';

interface CreateSalesOrderBody {
  customerId?: string;
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'sales:view');
  if (!session) return;

  await connectToDatabase();
  const orders = (await SalesOrder.find({ clientId: session.clientId }).sort({ createdAt: -1 }).lean()) as SalesOrderDoc[];
  const customers = (await Customer.find({ clientId: session.clientId }).select('name').lean()) as CustomerDoc[];
  const nameById = new Map(customers.map((c) => [c._id.toString(), c.name]));

  const jobCardIds = [...new Set(orders.map((o) => o.jobCardId?.toString()).filter((id): id is string => !!id))];
  const jobCards = jobCardIds.length > 0 ? ((await JobCard.find({ _id: { $in: jobCardIds } }).select('vehicle').lean()) as { _id: unknown; vehicle: string }[]) : [];
  const jobCardLabelById = new Map(jobCards.map((j) => [(j._id as { toString(): string }).toString(), j.vehicle]));

  const departmentIds = [...new Set(orders.map((o) => o.departmentId?.toString()).filter((id): id is string => !!id))];
  const departments = departmentIds.length > 0 ? ((await Department.find({ _id: { $in: departmentIds } }).select('name').lean()) as { _id: unknown; name: string }[]) : [];
  const departmentNameById = new Map(departments.map((d) => [(d._id as { toString(): string }).toString(), d.name]));

  return res.status(200).json({
    salesOrders: orders.map((o) =>
      serializeSalesOrder(
        o,
        nameById.get(o.customerId.toString()),
        o.jobCardId ? jobCardLabelById.get(o.jobCardId.toString()) : undefined,
        o.departmentId ? departmentNameById.get(o.departmentId.toString()) : undefined
      )
    ),
  });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'sales:manage');
  if (!session) return;

  const {
    customerId,
    branchId: requestedBranchId,
    salespersonId,
    jobCardId,
    departmentId,
    creditPeriod,
    payType,
    scheduledDeliveryDate,
    deliveryMarkingDate,
    deliveryType,
    deliveryName,
    deliveryAddress,
    customerAddress,
    customerTel,
    vatType,
    vatNumber,
    svatNumber,
    brand,
    items,
    notes,
    staffNote,
  } = (req.body ?? {}) as CreateSalesOrderBody;
  if (!customerId || !items || items.length === 0) {
    return res.status(400).json({ error: 'customerId and at least one item are required' });
  }

  await connectToDatabase();

  const customer = (await Customer.findOne({ _id: customerId, clientId: session.clientId }).lean()) as CustomerDoc | null;
  if (!customer) return res.status(400).json({ error: 'Unknown customer' });
  if (customer.status === 'Blocked') return res.status(400).json({ error: 'This customer is blocked and cannot be ordered for' });
  if (await isDealerPendingApproval(session.clientId, customer)) {
    return res.status(400).json({ error: 'This dealer is still pending credit approval and cannot be ordered for yet' });
  }

  if (salespersonId) {
    const salesperson = await Salesperson.findOne({ _id: salespersonId, clientId: session.clientId }).lean();
    if (!salesperson) return res.status(400).json({ error: 'Unknown salesperson' });
  }
  let jobCardLabel: string | undefined;
  if (jobCardId) {
    const jobCard = (await JobCard.findOne({ _id: jobCardId, clientId: session.clientId }).lean()) as JobCardDoc | null;
    if (!jobCard) return res.status(400).json({ error: 'Unknown job card' });
    jobCardLabel = jobCard.vehicle;
  }
  let departmentName: string | undefined;
  if (departmentId) {
    const department = (await Department.findOne({ _id: departmentId, clientId: session.clientId }).lean()) as { name: string } | null;
    if (!department) return res.status(400).json({ error: 'Unknown department' });
    departmentName = department.name;
  }

  const resolved = await resolveSalesOrderLines({
    session,
    customer,
    requestedBranchId,
    items,
    vatType: vatType === 'Vat' ? 'Vat' : 'Non Vat',
  });
  if (!resolved.ok) return res.status(resolved.status).json({ error: resolved.error });

  const salesOrderNumber = await generateSequentialNumber(SalesOrder, session.clientId, 'salesOrderNumber', 'salesOrder');

  // Best-effort attribution — an explicit salespersonId always wins; a
  // customer with no active assignment and no explicit pick simply gets no
  // salesperson credited, never blocks order creation.
  let resolvedSalespersonId = salespersonId;
  if (!resolvedSalespersonId) {
    const assignment = await SalespersonAssignment.findOne({ clientId: session.clientId, customerId, active: true }).lean();
    resolvedSalespersonId = assignment?.salespersonId?.toString();
  }

  const order = await SalesOrder.create({
    clientId: session.clientId,
    salesOrderNumber,
    customerId,
    branchId: resolved.branchId,
    salespersonId: resolvedSalespersonId || undefined,
    jobCardId: jobCardId || undefined,
    departmentId: departmentId || undefined,
    creditPeriod: creditPeriod || undefined,
    payType: payType === 'Cash' ? 'Cash' : 'Credit',
    scheduledDeliveryDate: scheduledDeliveryDate ? new Date(scheduledDeliveryDate) : undefined,
    deliveryMarkingDate: deliveryMarkingDate ? new Date(deliveryMarkingDate) : undefined,
    deliveryType: deliveryType?.trim() || 'Normal',
    deliveryName: deliveryName || undefined,
    deliveryAddress: deliveryAddress || undefined,
    // Snapshotted from the customer unless the staff explicitly overrode it
    // on this order — same "default from the record, editable per document"
    // convention as Quotation/CustomerInvoice's vehicle fields.
    customerAddress: customerAddress || customer.billingAddress || undefined,
    customerTel: customerTel || customer.phone || undefined,
    vatType: vatType === 'Vat' ? 'Vat' : 'Non Vat',
    vatNumber: vatNumber || customer.taxNumber || undefined,
    svatNumber: svatNumber || undefined,
    brand: brand || undefined,
    items: resolved.resolvedLines,
    subtotal: resolved.subtotal,
    discountPct: resolved.discountPct,
    discountAmount: resolved.discountAmount,
    taxAmount: resolved.taxAmount,
    total: resolved.total,
    notes,
    staffNote: staffNote || undefined,
    status: resolved.client?.requireSalesOrderApproval ? 'Pending Approval' : 'Confirmed',
  });

  return res.status(201).json({
    salesOrder: serializeSalesOrder(order.toObject(), customer.name, jobCardLabel, departmentName),
    creditWarning: resolved.creditWarning,
    discountWarning: resolved.discountWarning,
    appliedPromotions: resolved.appliedPromotions.length > 0 ? resolved.appliedPromotions : undefined,
  });
}

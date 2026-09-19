import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { CustomerInvoice, CustomerInvoiceDoc } from '../../models/CustomerInvoice.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { Client, ClientDoc } from '../../models/Client.js';
import { JobCard, JobCardDoc } from '../../models/JobCard.js';
import { SalesOrder, SalesOrderDoc } from '../../models/SalesOrder.js';
import { SalespersonAssignment } from '../../models/SalespersonAssignment.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeCustomerInvoice } from '../../serializers.js';
import { computeTotals, getTaxRatePct, LineItemInput } from '../../accounting.js';
import { generateSequentialNumber } from '../../numbering.js';
import { getEffectiveDiscountPct, isDealerPendingApproval } from '../../creditDiscipline.js';
import { checkCreditExposureLimit } from '../../salesExecCredit.js';
import { checkCustomerCreditLimitGate } from '../../customerCreditLimitGate.js';
import { checkReturnRatioGate } from '../../returnRatioGate.js';
import { checkInvoiceAmountThresholdGate } from '../../discountGovernance.js';

interface CreateInvoiceBody {
  customerId?: string;
  jobCardId?: string;
  // Optional informational reference — see CustomerInvoice.ts's own comment.
  // Never used to derive vehicle/plate (SalesOrder has no vehicle concept).
  salesOrderId?: string;
  vehicle?: string;
  plate?: string;
  items?: LineItemInput[];
  dueDate?: string;
  notes?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'customer-invoices:view');
  if (!session) return;

  await connectToDatabase();
  const invoices = (await CustomerInvoice.find({ clientId: session.clientId }).sort({ createdAt: -1 }).lean()) as CustomerInvoiceDoc[];
  const customers = (await Customer.find({ clientId: session.clientId }).lean()) as CustomerDoc[];
  const customerNameById = new Map(customers.map((c) => [c._id.toString(), c.name]));

  return res.status(200).json({
    invoices: invoices.map((inv) => serializeCustomerInvoice(inv, customerNameById.get(inv.customerId.toString()))),
  });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'customer-invoices:manage');
  if (!session) return;

  const { customerId, jobCardId, salesOrderId, vehicle, plate, items, dueDate, notes } = (req.body ?? {}) as CreateInvoiceBody;
  if (!customerId || !vehicle || !items || items.length === 0) {
    return res.status(400).json({ error: 'customerId, vehicle, and at least one item are required' });
  }

  await connectToDatabase();

  const customer = (await Customer.findOne({ _id: customerId, clientId: session.clientId }).lean()) as CustomerDoc | null;
  if (!customer) return res.status(400).json({ error: 'Unknown customer' });
  if (customer.status === 'Blocked') return res.status(400).json({ error: 'This customer is blocked and cannot be invoiced' });
  if (await isDealerPendingApproval(session.clientId, customer)) {
    return res.status(400).json({ error: 'This dealer is still pending credit approval and cannot be invoiced yet' });
  }

  // Same job-card-derived vehicle fields as api/quotations/index.ts.
  let vehicleFields = { vehicle, plate, vehicleId: undefined as string | undefined };
  if (jobCardId) {
    const jobCard = (await JobCard.findOne({ _id: jobCardId, clientId: session.clientId }).lean()) as JobCardDoc | null;
    if (!jobCard) return res.status(400).json({ error: 'Unknown job card' });
    vehicleFields = { vehicle: jobCard.vehicle, plate: jobCard.plate ?? undefined, vehicleId: jobCard.vehicleId?.toString() };
  }

  if (salesOrderId) {
    const salesOrder = (await SalesOrder.findOne({ _id: salesOrderId, clientId: session.clientId }).lean()) as SalesOrderDoc | null;
    if (!salesOrder) return res.status(400).json({ error: 'Unknown sales order' });
  }

  const effectiveDiscountPct = await getEffectiveDiscountPct(customer, session.clientId);
  const taxRatePct = await getTaxRatePct(session.clientId);
  const { items: computedItems, subtotal, discountPct, discountAmount, taxAmount, total } = computeTotals(
    items,
    effectiveDiscountPct,
    taxRatePct
  );

  const limitCheck = await checkCreditExposureLimit(session, customer, total);
  if (limitCheck.blocked) return res.status(400).json({ error: limitCheck.message });

  const client = (await Client.findById(session.clientId)
    .select('customerCreditLimitPolicy invoiceApprovalThresholdAmount returnRatioPolicy returnRatioThresholdPct')
    .lean()) as ClientDoc | null;
  const creditLimitGate = await checkCustomerCreditLimitGate(session, client?.customerCreditLimitPolicy ?? 'Off', customer, total);
  if (creditLimitGate.blocked) return res.status(400).json({ error: creditLimitGate.message });

  // Dealer Credit Control roadmap Module 1 — independent of the credit-limit
  // gate just above (a different risk signal entirely), checked right after
  // it so a customer failing both gets the credit-limit message first, same
  // "each check stands alone" ordering as every other gate in this route.
  const returnRatioGate = await checkReturnRatioGate(session, client?.returnRatioPolicy ?? 'Off', client?.returnRatioThresholdPct ?? 20, customer);
  if (returnRatioGate.blocked) return res.status(400).json({ error: returnRatioGate.message });

  const invoiceAmountGate = await checkInvoiceAmountThresholdGate(session, client?.invoiceApprovalThresholdAmount ?? 0, total);
  if (invoiceAmountGate.blocked) return res.status(400).json({ error: invoiceAmountGate.message });

  const invoiceNumber = await generateSequentialNumber(CustomerInvoice, session.clientId, 'invoiceNumber', 'invoice');

  // Best-effort attribution — see SalesOrder's identical lookup.
  const assignment = await SalespersonAssignment.findOne({ clientId: session.clientId, customerId, active: true }).lean();

  // Dealer Credit Control roadmap Module 5 — auto-computed from the
  // customer's own creditPeriodDays when not explicitly overridden, same
  // "default from the record, editable per document" snapshot convention
  // as customerAddress/customerTel elsewhere in this codebase. Previously
  // dueDate was purely manual with no real computation behind it at all.
  const now = new Date();
  const autoDueDate =
    customer.creditPeriodDays > 0 ? new Date(now.getTime() + customer.creditPeriodDays * 24 * 60 * 60 * 1000) : undefined;

  const invoice = await CustomerInvoice.create({
    clientId: session.clientId,
    customerId,
    jobCardId: jobCardId || undefined,
    salesOrderId: salesOrderId || undefined,
    salespersonId: assignment?.salespersonId || undefined,
    invoiceNumber,
    ...vehicleFields,
    items: computedItems,
    subtotal,
    discountPct,
    discountAmount,
    taxAmount,
    total,
    status: 'Issued',
    paidAmount: 0,
    balance: total,
    paymentStatus: 'Unpaid',
    dueDate: dueDate ? new Date(dueDate) : autoDueDate,
    notes,
  });

  return res.status(201).json({
    invoice: serializeCustomerInvoice(invoice.toObject(), (customer as CustomerDoc).name),
    creditWarning: creditLimitGate.warning,
    returnRatioWarning: returnRatioGate.warning,
    discountWarning: invoiceAmountGate.warning,
  });
}

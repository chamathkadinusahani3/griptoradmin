import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { CustomerInvoice, CustomerInvoiceDoc } from '../../models/CustomerInvoice.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { JobCard, JobCardDoc } from '../../models/JobCard.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeCustomerInvoice } from '../../serializers.js';
import { computeTotals, getTaxRatePct, LineItemInput } from '../../accounting.js';
import { generateSequentialNumber } from '../../numbering.js';
import { getEffectiveDiscountPct } from '../../creditDiscipline.js';
import { checkCreditExposureLimit } from '../../salesExecCredit.js';

interface CreateInvoiceBody {
  customerId?: string;
  jobCardId?: string;
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

  const { customerId, jobCardId, vehicle, plate, items, dueDate, notes } = (req.body ?? {}) as CreateInvoiceBody;
  if (!customerId || !vehicle || !items || items.length === 0) {
    return res.status(400).json({ error: 'customerId, vehicle, and at least one item are required' });
  }

  await connectToDatabase();

  const customer = (await Customer.findOne({ _id: customerId, clientId: session.clientId }).lean()) as CustomerDoc | null;
  if (!customer) return res.status(400).json({ error: 'Unknown customer' });

  // Same job-card-derived vehicle fields as api/quotations/index.ts.
  let vehicleFields = { vehicle, plate, vehicleId: undefined as string | undefined };
  if (jobCardId) {
    const jobCard = (await JobCard.findOne({ _id: jobCardId, clientId: session.clientId }).lean()) as JobCardDoc | null;
    if (!jobCard) return res.status(400).json({ error: 'Unknown job card' });
    vehicleFields = { vehicle: jobCard.vehicle, plate: jobCard.plate ?? undefined, vehicleId: jobCard.vehicleId?.toString() };
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

  const invoiceNumber = await generateSequentialNumber(CustomerInvoice, session.clientId, 'invoiceNumber', 'invoice');

  const invoice = await CustomerInvoice.create({
    clientId: session.clientId,
    customerId,
    jobCardId: jobCardId || undefined,
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
    dueDate: dueDate ? new Date(dueDate) : undefined,
    notes,
  });

  return res
    .status(201)
    .json({ invoice: serializeCustomerInvoice(invoice.toObject(), (customer as CustomerDoc).name) });
}

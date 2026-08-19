import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../../db.js';
import { JobCard, JobCardDoc } from '../../../models/JobCard.js';
import { CustomerInvoice } from '../../../models/CustomerInvoice.js';
import { Customer, CustomerDoc } from '../../../models/Customer.js';
import { requireTenantPermission } from '../../../auth.js';
import { serializeCustomerInvoice } from '../../../serializers.js';
import { computeTotals, getTaxRatePct, LineItemInput } from '../../../accounting.js';
import { generateSequentialNumber } from '../../../numbering.js';
import { getEffectiveDiscountPct } from '../../../creditDiscipline.js';
import { checkCreditExposureLimit } from '../../../salesExecCredit.js';

// Closes the loop: real parts consumed + real labor on a completed job
// become a real invoice — reusing the exact same server-computed-totals
// discipline as every other money-creating endpoint in this app (never a
// client-sent total, always computed here from source data).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'job-cards:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing job card id' });

  await connectToDatabase();

  const job = (await JobCard.findOne({ _id: id, clientId: session.clientId }).lean()) as JobCardDoc | null;
  if (!job) return res.status(404).json({ error: 'Job card not found' });
  if (job.status !== 'Completed') {
    return res.status(400).json({ error: 'Only a completed job can be invoiced' });
  }
  if (job.partsUsed.length === 0 && job.laborCost <= 0) {
    return res.status(400).json({ error: 'This job has no recorded parts or labor to invoice' });
  }

  const customer = (await Customer.findOne({ _id: job.customerId, clientId: session.clientId }).lean()) as CustomerDoc | null;
  if (!customer) return res.status(400).json({ error: 'Customer no longer exists' });

  const items: LineItemInput[] = job.partsUsed.map((p) => ({ description: p.name, quantity: p.qty, unitPrice: p.price }));
  if (job.laborCost > 0) items.push({ description: 'Labor', quantity: 1, unitPrice: job.laborCost });

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
    customerId: job.customerId,
    jobCardId: job._id,
    invoiceNumber,
    vehicle: job.vehicle,
    plate: job.plate,
    vehicleId: job.vehicleId,
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
  });

  return res.status(201).json({ invoice: serializeCustomerInvoice(invoice.toObject(), customer.name) });
}

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../_lib/db';
import { JobCard, JobCardDoc } from '../../_lib/models/JobCard';
import { CustomerInvoice } from '../../_lib/models/CustomerInvoice';
import { Customer, CustomerDoc } from '../../_lib/models/Customer';
import { requireTenant } from '../../_lib/auth';
import { serializeCustomerInvoice } from '../../_lib/serializers';
import { computeTotals, LineItemInput } from '../../_lib/accounting';
import { generateSequentialNumber } from '../../_lib/numbering';

// Closes the loop: real parts consumed + real labor on a completed job
// become a real invoice — reusing the exact same server-computed-totals
// discipline as every other money-creating endpoint in this app (never a
// client-sent total, always computed here from source data).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = requireTenant(req, res);
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

  const { items: computedItems, subtotal, discountPct, discountAmount, taxAmount, total } = computeTotals(
    items,
    customer.discountPct ?? 0
  );
  const invoiceNumber = await generateSequentialNumber(CustomerInvoice, session.clientId, 'invoiceNumber', 'INV');

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

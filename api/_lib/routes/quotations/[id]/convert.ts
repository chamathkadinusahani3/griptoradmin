import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../../db.js';
import { Quotation, QuotationDoc } from '../../../models/Quotation.js';
import { CustomerInvoice } from '../../../models/CustomerInvoice.js';
import { Customer, CustomerDoc } from '../../../models/Customer.js';
import { requireTenantPermission } from '../../../auth.js';
import { serializeCustomerInvoice } from '../../../serializers.js';
import { computeTotals } from '../../../accounting.js';
import { generateSequentialNumber } from '../../../numbering.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'quotations:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing quotation id' });

  await connectToDatabase();

  const quotation = (await Quotation.findOne({ _id: id, clientId: session.clientId }).lean()) as QuotationDoc | null;
  if (!quotation) return res.status(404).json({ error: 'Quotation not found' });
  if (quotation.status === 'Invoiced') {
    return res.status(400).json({ error: 'This quotation has already been converted to an invoice' });
  }

  const customer = await Customer.findOne({ _id: quotation.customerId, clientId: session.clientId }).lean();
  if (!customer) return res.status(400).json({ error: 'Customer no longer exists' });

  // Recomputed fresh from the quotation's items rather than trusting its
  // stored totals — cheap extra safety, same "compute from source of truth"
  // discipline as everywhere else in this phase. Uses the quotation's OWN
  // stored discountPct (not a fresh lookup of the customer's current
  // discount) so the invoice always matches what was actually quoted, even
  // if the customer's discount has since changed.
  const { items, subtotal, discountPct, discountAmount, taxAmount, total } = computeTotals(
    quotation.items,
    quotation.discountPct ?? 0
  );
  const invoiceNumber = await generateSequentialNumber(CustomerInvoice, session.clientId, 'invoiceNumber', 'INV');

  const invoice = await CustomerInvoice.create({
    clientId: session.clientId,
    customerId: quotation.customerId,
    jobCardId: quotation.jobCardId,
    quotationId: quotation._id,
    invoiceNumber,
    vehicle: quotation.vehicle,
    plate: quotation.plate,
    vehicleId: quotation.vehicleId,
    items,
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

  await Quotation.updateOne({ _id: id, clientId: session.clientId }, { status: 'Invoiced' });

  return res
    .status(201)
    .json({ invoice: serializeCustomerInvoice(invoice.toObject(), (customer as CustomerDoc).name) });
}

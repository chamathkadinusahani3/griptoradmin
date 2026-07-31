import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../../db.js';
import { CustomerInvoice, CustomerInvoiceDoc } from '../../../models/CustomerInvoice.js';
import { Customer, CustomerDoc } from '../../../models/Customer.js';
import { buildInvoiceCheckoutFields, getCheckoutActionUrl } from '../../../payhere.js';
import { resolveAppOrigin } from '../../../url.js';

// Public, unauthenticated — same pattern as api/public/inspections/[token].ts:
// a real random opaque token (never the raw Mongo _id) is the only
// "credential". Resolves a staff-shared payment link into the real PayHere
// checkout fields, which the public frontend page then auto-submits.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { token } = req.query;
  if (typeof token !== 'string') return res.status(400).json({ error: 'Missing token' });

  await connectToDatabase();
  const invoice = (await CustomerInvoice.findOne({ payToken: token }).lean()) as CustomerInvoiceDoc | null;
  if (!invoice) return res.status(404).json({ error: 'This payment link is no longer valid.' });
  if (invoice.status === 'Void') return res.status(400).json({ error: 'This invoice has been voided.' });
  if (invoice.paymentStatus === 'Paid') return res.status(400).json({ error: 'This invoice has already been paid.' });

  const customer = (await Customer.findById(invoice.customerId).lean()) as CustomerDoc | null;
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const origin = resolveAppOrigin(req);
  const invoiceId = invoice._id.toString();
  const fields = buildInvoiceCheckoutFields(invoice, customer, {
    returnUrl: `${origin}/pay/thank-you?invoiceId=${invoiceId}`,
    cancelUrl: `${origin}/pay/thank-you?invoiceId=${invoiceId}&cancelled=1`,
    notifyUrl: `${origin}/api/public/payhere-notify`,
  });

  return res.status(200).json({
    actionUrl: getCheckoutActionUrl(),
    fields,
    invoiceNumber: invoice.invoiceNumber,
    balance: invoice.balance,
  });
}

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../../../db.js';
import { CustomerInvoice, CustomerInvoiceDoc } from '../../../../models/CustomerInvoice.js';
import { Customer, CustomerDoc } from '../../../../models/Customer.js';
import { requireCustomer } from '../../../../auth.js';
import { buildInvoiceCheckoutFields, getCheckoutActionUrl } from '../../../../payhere.js';
import { resolveAppOrigin } from '../../../../url.js';

// Portal-facing: the customer is already here, so the frontend auto-submits
// the returned PayHere checkout form immediately rather than presenting a
// link to share (see src/lib/payhereCheckout.ts).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = requireCustomer(req, res);
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing invoice id' });

  await connectToDatabase();
  // Double-scoped by BOTH clientId and customerId — the portal's own
  // narrower boundary within a tenant (requireCustomer's own doc comment).
  const invoice = (await CustomerInvoice.findOne({
    _id: id,
    clientId: session.clientId,
    customerId: session.customerId,
  }).lean()) as CustomerInvoiceDoc | null;
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  if (invoice.status === 'Void') return res.status(400).json({ error: 'Cannot pay a void invoice' });
  if (invoice.paymentStatus === 'Paid') return res.status(400).json({ error: 'This invoice is already paid' });

  const customer = (await Customer.findById(invoice.customerId).lean()) as CustomerDoc | null;
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  try {
    const origin = resolveAppOrigin(req);
    const invoiceId = invoice._id.toString();
    const fields = buildInvoiceCheckoutFields(invoice, customer, {
      returnUrl: `${origin}/pay/thank-you?invoiceId=${invoiceId}`,
      cancelUrl: `${origin}/pay/thank-you?invoiceId=${invoiceId}&cancelled=1`,
      notifyUrl: `${origin}/api/public/payhere-notify`,
    });
    return res.status(200).json({ actionUrl: getCheckoutActionUrl(), fields });
  } catch (err) {
    return res.status(502).json({ error: err instanceof Error ? err.message : 'Failed to build checkout' });
  }
}

import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { connectToDatabase } from '../../../db.js';
import { CustomerInvoice, CustomerInvoiceDoc } from '../../../models/CustomerInvoice.js';
import { requireTenantPermission } from '../../../auth.js';
import { resolveAppOrigin } from '../../../url.js';

// Staff-facing: this app has no email delivery, so this returns a
// shareable link staff copy and send via WhatsApp/SMS manually — same
// "share this link" convention as the booking link and approval link.
// Unlike Stripe Checkout (one URL straight to the gateway), PayHere's
// checkout is a form POST, so the shared link points at OUR OWN public
// page (/pay/checkout/:token — see api/public/pay/[token].ts), which then
// auto-submits the real PayHere form on load.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'customer-invoices:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing invoice id' });

  await connectToDatabase();
  const invoice = (await CustomerInvoice.findOne({ _id: id, clientId: session.clientId }).lean()) as CustomerInvoiceDoc | null;
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  if (invoice.status === 'Void') return res.status(400).json({ error: 'Cannot create a payment link for a void invoice' });
  if (invoice.paymentStatus === 'Paid') return res.status(400).json({ error: 'This invoice is already paid' });

  let payToken = invoice.payToken;
  if (!payToken) {
    payToken = crypto.randomBytes(24).toString('hex');
    await CustomerInvoice.updateOne({ _id: id, clientId: session.clientId }, { payToken });
  }

  const shareUrl = `${resolveAppOrigin(req)}/pay/checkout/${payToken}`;
  return res.status(200).json({ url: shareUrl });
}

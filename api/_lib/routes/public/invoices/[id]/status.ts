import type { VercelRequest, VercelResponse } from '@vercel/node';
import mongoose from 'mongoose';
import { connectToDatabase } from '../../../../db.js';
import { CustomerInvoice, CustomerInvoiceDoc } from '../../../../models/CustomerInvoice.js';

// Public, unauthenticated — the /pay/thank-you page reads this to reflect
// current status after a PayHere checkout redirect. Deliberately narrow: no
// customer/vehicle/financial-history fields, only what's needed to render
// "paid" vs "still processing". The notify callback (api/public/payhere-notify.ts),
// not this endpoint or the redirect itself, is what actually marks an
// invoice paid — this is read-only UX reflection.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (typeof id !== 'string' || !mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: 'Missing invoice id' });
  }

  await connectToDatabase();
  const invoice = (await CustomerInvoice.findById(id).lean()) as CustomerInvoiceDoc | null;
  if (!invoice) return res.status(404).json({ error: 'Not found' });

  return res.status(200).json({
    invoiceNumber: invoice.invoiceNumber,
    total: invoice.total,
    balance: invoice.balance,
    paymentStatus: invoice.paymentStatus,
  });
}

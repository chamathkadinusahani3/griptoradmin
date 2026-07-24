import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../_lib/db';
import { CustomerInvoice, CustomerInvoiceDoc } from '../_lib/models/CustomerInvoice';
import { requireCustomer } from '../_lib/auth';
import { serializeCustomerInvoice } from '../_lib/serializers';

// PDF download is handled entirely client-side by reusing the existing
// src/lib/pdf.ts downloadDocumentPdf() from Phase 4 — no new PDF code here.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = requireCustomer(req, res);
  if (!session) return;

  await connectToDatabase();
  const invoices = (await CustomerInvoice.find({
    clientId: session.clientId,
    customerId: session.customerId,
    status: { $ne: 'Void' },
  })
    .sort({ createdAt: -1 })
    .lean()) as CustomerInvoiceDoc[];

  return res.status(200).json({ invoices: invoices.map((inv) => serializeCustomerInvoice(inv)) });
}

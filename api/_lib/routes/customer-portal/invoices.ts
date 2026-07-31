import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { CustomerInvoice, CustomerInvoiceDoc } from '../../models/CustomerInvoice.js';
import { requireCustomer } from '../../auth.js';
import { serializeCustomerInvoice } from '../../serializers.js';

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

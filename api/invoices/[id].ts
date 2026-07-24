import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../_lib/db';
import { Invoice, InvoiceDoc } from '../_lib/models/Invoice';
import { Client, ClientDoc } from '../_lib/models/Client';
import { requireAuth } from '../_lib/auth';
import { serializeInvoice } from '../_lib/serializers';

interface UpdateInvoiceBody {
  status?: 'Paid' | 'Pending' | 'Failed';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!requireAuth(req, res, 'super')) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing invoice id' });

  const { status } = (req.body ?? {}) as UpdateInvoiceBody;
  if (!status) return res.status(400).json({ error: 'status is required' });

  await connectToDatabase();
  const invoice = (await Invoice.findByIdAndUpdate(id, { status }, { returnDocument: 'after' }).lean()) as InvoiceDoc | null;
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

  const client = (await Client.findById(invoice.clientId).lean()) as ClientDoc | null;
  return res.status(200).json({ invoice: serializeInvoice(invoice, client?.name) });
}

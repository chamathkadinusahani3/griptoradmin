import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Invoice, InvoiceDoc } from '../../models/Invoice.js';
import { Client, ClientDoc } from '../../models/Client.js';
import { requireAuth } from '../../auth.js';
import { serializeInvoice } from '../../serializers.js';

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
  const existing = (await Invoice.findById(id).lean()) as InvoiceDoc | null;
  if (!existing) return res.status(404).json({ error: 'Invoice not found' });

  // Real gateway retry is TEMPORARILY unavailable — Stripe was removed
  // (doesn't support Sri Lankan merchants), PayHere's tenant-billing
  // integration is a later phase (not built yet). This is a local status
  // flip only until then, same as a legacy invoice always was.
  const invoice = (await Invoice.findByIdAndUpdate(id, { status }, { returnDocument: 'after' }).lean()) as InvoiceDoc;

  const client = (await Client.findById(invoice.clientId).lean()) as ClientDoc | null;
  return res.status(200).json({ invoice: serializeInvoice(invoice, client?.name) });
}

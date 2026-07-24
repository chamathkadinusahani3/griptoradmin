import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../_lib/db';
import { Invoice, InvoiceDoc } from '../_lib/models/Invoice';
import { Client, ClientDoc } from '../_lib/models/Client';
import { requireAuth } from '../_lib/auth';
import { serializeInvoice } from '../_lib/serializers';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!requireAuth(req, res, 'super')) return;

  await connectToDatabase();

  const { clientId } = req.query;
  const filter = typeof clientId === 'string' ? { clientId } : {};

  const invoices = (await Invoice.find(filter).sort({ createdAt: -1 }).lean()) as InvoiceDoc[];
  const clients = (await Client.find().lean()) as ClientDoc[];
  const nameById = new Map(clients.map((c) => [c._id.toString(), c.name]));

  return res.status(200).json({
    invoices: invoices.map((inv) => serializeInvoice(inv, nameById.get(inv.clientId.toString()))),
  });
}

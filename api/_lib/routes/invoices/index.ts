import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Invoice, InvoiceDoc } from '../../models/Invoice.js';
import { Client, ClientDoc } from '../../models/Client.js';
import { requireAuth } from '../../auth.js';
import { serializeInvoice } from '../../serializers.js';

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

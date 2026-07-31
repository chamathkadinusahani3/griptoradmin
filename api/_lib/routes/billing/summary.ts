import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Client, ClientDoc } from '../../models/Client.js';
import { Invoice, InvoiceDoc } from '../../models/Invoice.js';
import { requireAuth } from '../../auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!requireAuth(req, res, 'super')) return;

  await connectToDatabase();

  const clients = (await Client.find().lean()) as ClientDoc[];
  const invoices = (await Invoice.find().lean()) as InvoiceDoc[];

  const totalMrr = clients.reduce((sum, c) => sum + c.mrr, 0);

  const byPlan = new Map<string, { plan: string; mrr: number; clients: number }>();
  for (const c of clients) {
    const entry = byPlan.get(c.plan) ?? { plan: c.plan, mrr: 0, clients: 0 };
    entry.mrr += c.mrr;
    entry.clients += 1;
    byPlan.set(c.plan, entry);
  }

  const failedInvoiceCount = invoices.filter((i) => i.status === 'Failed').length;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const collectedThisMonth = invoices
    .filter((i) => i.status === 'Paid' && (i as unknown as { createdAt: Date }).createdAt >= monthStart)
    .reduce((sum, i) => sum + i.amount, 0);

  return res.status(200).json({
    totalMrr,
    mrrByPlan: Array.from(byPlan.values()),
    failedInvoiceCount,
    collectedThisMonth,
  });
}

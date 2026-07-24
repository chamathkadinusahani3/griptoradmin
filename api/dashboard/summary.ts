import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../_lib/db';
import { Client, ClientDoc } from '../_lib/models/Client';
import { Ticket, TicketDoc } from '../_lib/models/Ticket';
import { Invoice, InvoiceDoc } from '../_lib/models/Invoice';
import { requireAuth } from '../_lib/auth';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_BACK = 6;

function lastNMonths(n: number): { label: string; year: number; month: number }[] {
  const now = new Date();
  const out: { label: string; year: number; month: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ label: MONTH_LABELS[d.getMonth()], year: d.getFullYear(), month: d.getMonth() });
  }
  return out;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!requireAuth(req, res, 'super')) return;

  await connectToDatabase();

  const clients = (await Client.find().lean()) as ClientDoc[];
  const tickets = (await Ticket.find().sort({ createdAt: -1 }).limit(8).lean()) as TicketDoc[];
  const invoices = (await Invoice.find({ status: 'Paid' }).sort({ createdAt: -1 }).limit(8).lean()) as InvoiceDoc[];
  const nameById = new Map(clients.map((c) => [c._id.toString(), c.name]));

  const totalClients = clients.length;
  const mrr = clients.reduce((sum, c) => sum + c.mrr, 0);
  const activeTrials = clients.filter((c) => c.status === 'Trial').length;
  const suspended = clients.filter((c) => c.status === 'Suspended').length;
  const churnRatePct = totalClients > 0 ? Math.round((suspended / totalClients) * 1000) / 10 : 0;

  const months = lastNMonths(MONTHS_BACK);
  const signupSeries = months.map(({ label, year, month }) => ({
    month: label,
    signups: clients.filter((c) => {
      const d = new Date(c.signupDate);
      return d.getFullYear() === year && d.getMonth() === month;
    }).length,
  }));
  const mrrSeries = months.map(({ label, year, month }) => {
    const cutoff = new Date(year, month + 1, 1); // end of that month
    const committed = clients
      .filter((c) => new Date(c.signupDate) < cutoff)
      .reduce((sum, c) => sum + c.mrr, 0);
    return { month: label, mrr: committed };
  });

  type Activity = { id: string; type: 'signup' | 'churn' | 'ticket' | 'payment'; text: string; time: Date };
  const activity: Activity[] = [
    ...clients.map((c) => ({
      id: `signup-${c._id}`,
      type: 'signup' as const,
      text: `${c.name} started a ${c.plan} ${c.status === 'Trial' ? 'trial' : 'subscription'}`,
      time: (c as unknown as { createdAt: Date }).createdAt,
    })),
    ...clients
      .filter((c) => c.status === 'Suspended')
      .map((c) => ({
        id: `churn-${c._id}`,
        type: 'churn' as const,
        text: `${c.name} subscription suspended`,
        time: (c as unknown as { updatedAt: Date }).updatedAt,
      })),
    ...tickets.map((t) => ({
      id: `ticket-${t._id}`,
      type: 'ticket' as const,
      text: `New ${t.priority.toLowerCase()}-priority ticket from ${nameById.get(t.clientId.toString()) ?? 'a client'}`,
      time: (t as unknown as { createdAt: Date }).createdAt,
    })),
    ...invoices.map((inv) => ({
      id: `payment-${inv._id}`,
      type: 'payment' as const,
      text: `${nameById.get(inv.clientId.toString()) ?? 'A client'} paid invoice ($${inv.amount})`,
      time: (inv as unknown as { createdAt: Date }).createdAt,
    })),
  ]
    .sort((a, b) => b.time.getTime() - a.time.getTime())
    .slice(0, 8);

  return res.status(200).json({
    stats: { totalClients, mrr, activeTrials, churnRatePct },
    signupSeries,
    mrrSeries,
    recentActivity: activity,
  });
}

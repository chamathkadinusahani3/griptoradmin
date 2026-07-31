import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { JobCard } from '../../models/JobCard.js';
import { Part } from '../../models/Part.js';
import { Reminder } from '../../models/Reminder.js';
import { Sale, SaleDoc } from '../../models/Sale.js';
import { requireTenant } from '../../auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = requireTenant(req, res);
  if (!session) return;

  await connectToDatabase();

  const [openJobs, parts, upcomingReminders] = await Promise.all([
    JobCard.countDocuments({ clientId: session.clientId, status: { $ne: 'Completed' } }),
    Part.find({ clientId: session.clientId }).lean(),
    Reminder.countDocuments({ clientId: session.clientId, status: 'Scheduled' }),
  ]);
  const lowStock = parts.filter((p) => p.stock <= p.reorderAt).length;

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const salesThisMonth = (await Sale.find({
    clientId: session.clientId,
    createdAt: { $gte: monthStart },
  }).lean()) as SaleDoc[];
  const revenueThisMonth = salesThisMonth.reduce((sum, s) => sum + s.total, 0);

  return res.status(200).json({
    stats: { openJobs, lowStock, upcomingReminders, revenueThisMonth },
  });
}

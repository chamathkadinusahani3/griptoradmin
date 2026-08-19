import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Booking, BookingDoc } from '../../models/Booking.js';
import { requireTenantPermission } from '../../auth.js';
import { resolveReportRange } from '../../reportRange.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'reports:view');
  if (!session) return;

  const { from, to } = resolveReportRange(req);
  await connectToDatabase();

  const bookings = (await Booking.find({ clientId: session.clientId, createdAt: { $gte: from, $lte: to } }).lean()) as BookingDoc[];

  const byStatus = { Pending: 0, Waiting: 0, 'In Progress': 0, Completed: 0, Cancelled: 0 };
  const bySource = { public: 0, staff: 0 };
  const dailyVolume = new Map<string, number>();
  let convertedToJob = 0;

  for (const b of bookings) {
    if (b.status in byStatus) byStatus[b.status as keyof typeof byStatus] += 1;
    bySource[b.source as keyof typeof bySource] += 1;
    if (b.jobCardId) convertedToJob += 1;

    const day = (b as unknown as { createdAt: Date }).createdAt.toISOString().slice(0, 10);
    dailyVolume.set(day, (dailyVolume.get(day) ?? 0) + 1);
  }

  const total = bookings.length;

  return res.status(200).json({
    range: { from, to },
    total,
    conversionRate: total ? Math.round((convertedToJob / total) * 100) : 0,
    cancellationRate: total ? Math.round((byStatus.Cancelled / total) * 100) : 0,
    onlineSharePct: total ? Math.round((bySource.public / total) * 100) : 0,
    byStatus,
    bySource,
    dailyVolume: Array.from(dailyVolume.entries()).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date)),
  });
}

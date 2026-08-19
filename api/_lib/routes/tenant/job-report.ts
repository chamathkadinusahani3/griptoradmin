import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { JobCard, JobCardDoc } from '../../models/JobCard.js';
import { Technician, TechnicianDoc } from '../../models/Technician.js';
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

  const [jobs, technicians] = await Promise.all([
    JobCard.find({ clientId: session.clientId, createdAt: { $gte: from, $lte: to } }).lean() as Promise<JobCardDoc[]>,
    Technician.find({ clientId: session.clientId }).select('name').lean() as Promise<TechnicianDoc[]>,
  ]);
  const technicianNameById = new Map(technicians.map((t) => [t._id.toString(), t.name]));

  const byStatus = { New: 0, 'In Progress': 0, 'Awaiting Parts': 0, Completed: 0, Cancelled: 0 };
  const byTechMap = new Map<string, { total: number; completed: number }>();
  const byServiceMap = new Map<string, number>();
  const dailyVolume = new Map<string, number>();
  const turnaroundHours: number[] = [];

  for (const job of jobs) {
    if (job.status in byStatus) byStatus[job.status as keyof typeof byStatus] += 1;

    const techId = job.technicianId.toString();
    const tech = byTechMap.get(techId) ?? { total: 0, completed: 0 };
    tech.total += 1;
    if (job.status === 'Completed') tech.completed += 1;
    byTechMap.set(techId, tech);

    const serviceName = job.service || 'Unspecified';
    byServiceMap.set(serviceName, (byServiceMap.get(serviceName) ?? 0) + 1);

    const day = (job as unknown as { createdAt: Date }).createdAt.toISOString().slice(0, 10);
    dailyVolume.set(day, (dailyVolume.get(day) ?? 0) + 1);

    if (job.status === 'Completed' && job.startedAt && job.completedAt) {
      turnaroundHours.push((new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()) / 3600000);
    }
  }

  const totalJobs = jobs.length;
  const completedJobs = byStatus.Completed;
  const avgTurnaroundHours = turnaroundHours.length
    ? Math.round((turnaroundHours.reduce((a, b) => a + b, 0) / turnaroundHours.length) * 10) / 10
    : null;

  return res.status(200).json({
    range: { from, to },
    totalJobs,
    completedJobs,
    cancelledJobs: byStatus.Cancelled,
    completionRate: totalJobs ? Math.round((completedJobs / totalJobs) * 100) : 0,
    avgTurnaroundHours,
    byStatus,
    byTechnician: Array.from(byTechMap.entries())
      .map(([id, v]) => ({ technician: technicianNameById.get(id) ?? 'Unknown', ...v }))
      .sort((a, b) => b.total - a.total),
    byService: Array.from(byServiceMap.entries())
      .map(([service, count]) => ({ service, count }))
      .sort((a, b) => b.count - a.count),
    dailyVolume: Array.from(dailyVolume.entries()).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date)),
  });
}

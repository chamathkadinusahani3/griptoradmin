import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Bay, BayDoc } from '../../models/Bay.js';
import { JobCard, JobCardDoc } from '../../models/JobCard.js';
import { Technician, TechnicianDoc } from '../../models/Technician.js';
import { Attendance, AttendanceDoc } from '../../models/Attendance.js';
import { requireTenantPermission } from '../../auth.js';
import { resolveReportRange } from '../../reportRange.js';
import { computeHoursWorked } from '../../attendance.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'reports:view');
  if (!session) return;

  const { from, to } = resolveReportRange(req);
  await connectToDatabase();

  const fromDay = from.toISOString().slice(0, 10);
  const toDay = to.toISOString().slice(0, 10);

  const [bays, jobs, technicians, attendanceDocs] = await Promise.all([
    Bay.find({ clientId: session.clientId }).lean() as Promise<BayDoc[]>,
    JobCard.find({ clientId: session.clientId, createdAt: { $gte: from, $lte: to } }).lean() as Promise<JobCardDoc[]>,
    Technician.find({ clientId: session.clientId }).select('name').lean() as Promise<TechnicianDoc[]>,
    Attendance.find({
      clientId: session.clientId,
      technicianId: { $exists: true },
      date: { $gte: fromDay, $lte: toDay },
    }).lean() as Promise<AttendanceDoc[]>,
  ]);
  const technicianNameById = new Map(technicians.map((t) => [t._id.toString(), t.name]));

  // --- Bay utilization: occupied hours (jobs with a bay assigned, actually
  // started+finished in range) over total available bay-hours in the period.
  let occupiedHours = 0;
  let jobsWithBay = 0;
  for (const job of jobs) {
    if (job.bayId) jobsWithBay += 1;
    if (job.bayId && job.startedAt && job.completedAt) {
      occupiedHours += (new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()) / 3600000;
    }
  }
  const periodHours = Math.max(1, (to.getTime() - from.getTime()) / 3600000);
  const availableBayHours = bays.length * periodHours;
  const bayUtilizationPct = availableBayHours > 0 ? Math.round((occupiedHours / availableBayHours) * 100) : 0;

  // --- Technician attendance ---
  const byTechAttendance = new Map<string, { daysWorked: number; hoursWorked: number }>();
  for (const a of attendanceDocs) {
    if (!a.technicianId) continue;
    const key = a.technicianId.toString();
    const agg = byTechAttendance.get(key) ?? { daysWorked: 0, hoursWorked: 0 };
    const hours = computeHoursWorked(a);
    if (hours !== null) {
      agg.daysWorked += 1;
      agg.hoursWorked += hours;
    }
    byTechAttendance.set(key, agg);
  }
  const totalHoursWorked = Array.from(byTechAttendance.values()).reduce((sum, v) => sum + v.hoursWorked, 0);

  return res.status(200).json({
    range: { from, to },
    bayCount: bays.length,
    bayUtilizationPct,
    jobsWithBayAssigned: jobsWithBay,
    totalJobs: jobs.length,
    totalHoursWorked: Math.round(totalHoursWorked * 100) / 100,
    technicianAttendance: Array.from(byTechAttendance.entries())
      .map(([id, v]) => ({ technician: technicianNameById.get(id) ?? 'Unknown', daysWorked: v.daysWorked, hoursWorked: Math.round(v.hoursWorked * 100) / 100 }))
      .sort((a, b) => b.hoursWorked - a.hoursWorked),
  });
}

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Technician, TechnicianDoc } from '../../models/Technician.js';
import { JobCard, JobCardDoc } from '../../models/JobCard.js';
import { Attendance, AttendanceDoc } from '../../models/Attendance.js';
import { requireTenantPermission } from '../../auth.js';
import { isValidBranch, resolveBranchFilter } from '../../branch.js';
import { serializeTechnician } from '../../serializers.js';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

interface CreateTechnicianBody {
  name?: string;
  specialty?: string;
  branchId?: string;
  hourlyRate?: number;
  maxConcurrentJobs?: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'technicians:view');
  if (!session) return;

  await connectToDatabase();
  const { branchId } = req.query;
  const effectiveBranchId = resolveBranchFilter(session, typeof branchId === 'string' ? branchId : undefined);
  const filter: Record<string, unknown> = { clientId: session.clientId };
  if (effectiveBranchId) filter.branchId = effectiveBranchId;
  const technicians = (await Technician.find(filter).sort({ createdAt: 1 }).lean()) as TechnicianDoc[];
  const jobs = (await JobCard.find({ clientId: session.clientId }).lean()) as JobCardDoc[];
  // technicianId: { $exists: true } — Attendance also holds userId-keyed
  // self-service rows now (api/_lib/routes/attendance/me.ts); this roster is
  // Technician-only, same reasoning as payroll-runs/index.ts's identical filter.
  const attendanceToday = (await Attendance.find({
    clientId: session.clientId,
    date: todayStr(),
    technicianId: { $exists: true },
  }).lean()) as AttendanceDoc[];
  const attendanceByTechId = new Map(attendanceToday.map((a) => [a.technicianId!.toString(), a]));

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  return res.status(200).json({
    technicians: technicians.map((t) => {
      const own = jobs.filter((j) => j.technicianId.toString() === t._id.toString());
      const activeJobs = own.filter((j) => j.status !== 'Completed' && j.status !== 'Cancelled').length;
      const completedToday = own.filter(
        (j) => j.status === 'Completed' && (j as unknown as { updatedAt: Date }).updatedAt >= todayStart
      ).length;
      const attendance = attendanceByTechId.get(t._id.toString());
      return serializeTechnician(t, activeJobs, completedToday, attendance ? { status: attendance.status, clockInAt: attendance.clockInAt ?? undefined } : null);
    }),
  });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'technicians:manage');
  if (!session) return;

  const { name, specialty, branchId, hourlyRate, maxConcurrentJobs } = (req.body ?? {}) as CreateTechnicianBody;
  if (!name || !specialty) {
    return res.status(400).json({ error: 'name and specialty are required' });
  }

  await connectToDatabase();
  if (branchId && !(await isValidBranch(session.clientId, branchId))) {
    return res.status(400).json({ error: 'Unknown branch' });
  }
  const technician = await Technician.create({
    clientId: session.clientId,
    name,
    specialty,
    status: 'Available',
    branchId: branchId || undefined,
    hourlyRate: hourlyRate || undefined,
    maxConcurrentJobs: maxConcurrentJobs || 4,
  });

  return res.status(201).json({ technician: serializeTechnician(technician.toObject()) });
}

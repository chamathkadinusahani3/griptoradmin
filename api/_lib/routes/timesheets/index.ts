import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Timesheet, TimesheetDoc } from '../../models/Timesheet.js';
import { Technician, TechnicianDoc } from '../../models/Technician.js';
import { Employee, EmployeeDoc } from '../../models/Employee.js';
import { User, UserDoc } from '../../models/User.js';
import { Attendance, AttendanceDoc } from '../../models/Attendance.js';
import { connectToDatabase } from '../../db.js';
import { requireTenantPermission } from '../../auth.js';
import { computeHoursWorked } from '../../attendance.js';
import { serializeTimesheet } from '../../serializers.js';

interface CreateTimesheetBody {
  subjectType?: 'technician' | 'employee';
  subjectId?: string;
  periodStart?: string;
  periodEnd?: string;
  notes?: string;
}

function toDayString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'payroll:view');
  if (!session) return;

  await connectToDatabase();
  const timesheets = (await Timesheet.find({ clientId: session.clientId }).sort({ createdAt: -1 }).lean()) as TimesheetDoc[];
  const reviewerIds = [...new Set(timesheets.map((t) => t.reviewedBy?.toString()).filter(Boolean) as string[])];
  const reviewers = (await User.find({ _id: { $in: reviewerIds } }).select('name').lean()) as UserDoc[];
  const nameById = new Map(reviewers.map((u) => [u._id.toString(), u.name]));

  return res.status(200).json({
    timesheets: timesheets.map((t) => serializeTimesheet(t, t.reviewedBy ? nameById.get(t.reviewedBy.toString()) : undefined)),
  });
}

// Snapshots total hours from Attendance at submission time — same source
// data and computeHoursWorked() math as payroll generation
// (payroll-runs/index.ts), just scoped to one subject and rolled up into
// one number instead of a payroll line.
async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'payroll:manage');
  if (!session) return;

  const { subjectType, subjectId, periodStart, periodEnd, notes } = (req.body ?? {}) as CreateTimesheetBody;
  if (!subjectType || !subjectId || !periodStart || !periodEnd) {
    return res.status(400).json({ error: 'subjectType, subjectId, periodStart, and periodEnd are required' });
  }
  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return res.status(400).json({ error: 'Invalid period range' });
  }

  await connectToDatabase();

  let subjectName: string;
  let attendanceFilter: Record<string, unknown>;
  if (subjectType === 'technician') {
    const tech = (await Technician.findOne({ _id: subjectId, clientId: session.clientId }).lean()) as TechnicianDoc | null;
    if (!tech) return res.status(400).json({ error: 'Unknown technician' });
    subjectName = tech.name;
    attendanceFilter = { technicianId: subjectId };
  } else if (subjectType === 'employee') {
    const emp = (await Employee.findOne({ _id: subjectId, clientId: session.clientId }).lean()) as EmployeeDoc | null;
    if (!emp) return res.status(400).json({ error: 'Unknown employee' });
    const user = (await User.findById(emp.userId).select('name').lean()) as { name: string } | null;
    subjectName = user?.name ?? 'Unknown employee';
    attendanceFilter = { userId: emp.userId };
  } else {
    return res.status(400).json({ error: 'subjectType must be technician or employee' });
  }

  const records = (await Attendance.find({
    clientId: session.clientId,
    date: { $gte: toDayString(start), $lte: toDayString(end) },
    ...attendanceFilter,
  }).lean()) as AttendanceDoc[];
  const totalHours = Math.round(records.reduce((sum, r) => sum + (computeHoursWorked(r) ?? 0), 0) * 100) / 100;

  const timesheet = await Timesheet.create({
    clientId: session.clientId,
    technicianId: subjectType === 'technician' ? subjectId : undefined,
    employeeId: subjectType === 'employee' ? subjectId : undefined,
    subjectName,
    periodStart: start,
    periodEnd: end,
    totalHours,
    notes,
  });

  return res.status(201).json({ timesheet: serializeTimesheet(timesheet.toObject()) });
}

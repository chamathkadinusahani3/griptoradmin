import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { PayrollRun, PayrollRunDoc } from '../../models/PayrollRun.js';
import { Technician, TechnicianDoc } from '../../models/Technician.js';
import { Attendance, AttendanceDoc } from '../../models/Attendance.js';
import { computeHoursWorked } from '../../attendance.js';
import { requireTenantPermission } from '../../auth.js';
import { serializePayrollRun } from '../../serializers.js';

interface GenerateRunBody {
  periodStart?: string;
  periodEnd?: string;
}

function toDayString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleGenerate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'payroll:view');
  if (!session) return;

  await connectToDatabase();
  const runs = (await PayrollRun.find({ clientId: session.clientId }).sort({ periodStart: -1 }).lean()) as PayrollRunDoc[];
  return res.status(200).json({ payrollRuns: runs.map(serializePayrollRun) });
}

// Real payroll generation from real attendance data — technicians' hourly
// rates × real clocked hours (Phase 3's Attendance model), not invented.
async function handleGenerate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'payroll:manage');
  if (!session) return;

  const { periodStart, periodEnd } = (req.body ?? {}) as GenerateRunBody;
  if (!periodStart || !periodEnd) {
    return res.status(400).json({ error: 'periodStart and periodEnd are required' });
  }
  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return res.status(400).json({ error: 'Invalid period range' });
  }

  await connectToDatabase();

  const technicians = (await Technician.find({ clientId: session.clientId, active: true }).lean()) as TechnicianDoc[];
  const startDay = toDayString(start);
  const endDay = toDayString(end);
  // technicianId: { $exists: true } — Attendance now also holds userId-keyed
  // self-service rows for non-Technician staff (api/_lib/routes/attendance/me.ts),
  // which payroll was never designed to know about (Payroll stays
  // Technician-only, unchanged, per that phase's own scope decision). This
  // filter is what makes that explicit rather than relying on every row
  // happening to have a technicianId — without it, the .toString() below
  // would throw on a userId-only row.
  const records = (await Attendance.find({
    clientId: session.clientId,
    date: { $gte: startDay, $lte: endDay },
    technicianId: { $exists: true },
  }).lean()) as AttendanceDoc[];
  const recordsByTechnician = new Map<string, AttendanceDoc[]>();
  for (const record of records) {
    // Guaranteed present by the technicianId: { $exists: true } filter above
    // — TS can't infer that from the query object, hence the assertion.
    const key = record.technicianId!.toString();
    const list = recordsByTechnician.get(key) ?? [];
    list.push(record);
    recordsByTechnician.set(key, list);
  }

  const lines = technicians
    .map((tech) => {
      const techRecords = recordsByTechnician.get(tech._id.toString()) ?? [];
      const hoursWorked =
        Math.round(
          techRecords.reduce((sum, r) => sum + (computeHoursWorked(r) ?? 0), 0) * 100
        ) / 100;
      const missingRate = tech.hourlyRate == null;
      const grossPay = missingRate ? 0 : Math.round(hoursWorked * tech.hourlyRate! * 100) / 100;
      return {
        technicianId: tech._id,
        technicianName: tech.name,
        hourlyRate: tech.hourlyRate,
        hoursWorked,
        grossPay,
        missingRate,
      };
    })
    // Skip technicians with no clocked hours in this period at all — an
    // empty payslip for someone who never worked the period isn't useful.
    .filter((line) => line.hoursWorked > 0);

  const totalAmount = Math.round(lines.reduce((sum, l) => sum + l.grossPay, 0) * 100) / 100;

  const run = await PayrollRun.create({
    clientId: session.clientId,
    periodStart: start,
    periodEnd: end,
    status: 'Draft',
    lines,
    totalAmount,
  });

  return res.status(201).json({ payrollRun: serializePayrollRun(run.toObject()) });
}

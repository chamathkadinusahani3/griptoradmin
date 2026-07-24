import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../_lib/db';
import { Technician } from '../../_lib/models/Technician';
import { Attendance, AttendanceDoc } from '../../_lib/models/Attendance';
import { requireTenant } from '../../_lib/auth';

const HISTORY_DAYS = 14;

function computeHoursWorked(record: AttendanceDoc): number | null {
  if (!record.clockInAt || !record.clockOutAt) return null;
  const totalMs = record.clockOutAt.getTime() - record.clockInAt.getTime();
  const breakMs = record.breakLogs.reduce((sum, b) => {
    if (!b.endedAt) return sum; // an unclosed break shouldn't happen on a clocked-out day, but don't let it produce a negative total if it does
    return sum + (b.endedAt.getTime() - b.startedAt.getTime());
  }, 0);
  return Math.round(((totalMs - breakMs) / 3600000) * 100) / 100;
}

// Real attendance data has been captured per-day since Phase 3 but never
// surfaced beyond "today" — this is that history, finally shown.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = requireTenant(req, res);
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing technician id' });

  await connectToDatabase();

  const technician = await Technician.findOne({ _id: id, clientId: session.clientId }).lean();
  if (!technician) return res.status(404).json({ error: 'Technician not found' });

  const records = (await Attendance.find({ clientId: session.clientId, technicianId: id })
    .sort({ date: -1 })
    .limit(HISTORY_DAYS)
    .lean()) as AttendanceDoc[];

  return res.status(200).json({
    history: records.map((r) => ({
      date: r.date,
      status: r.status,
      clockInAt: r.clockInAt,
      clockOutAt: r.clockOutAt,
      breakCount: r.breakLogs.length,
      hoursWorked: computeHoursWorked(r),
    })),
  });
}

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../../db.js';
import { Technician } from '../../../models/Technician.js';
import { Attendance, AttendanceDoc } from '../../../models/Attendance.js';
import { requireTenantPermission } from '../../../auth.js';
import { computeHoursWorked } from '../../../attendance.js';

const HISTORY_DAYS = 14;

// Real attendance data has been captured per-day since Phase 3 but never
// surfaced beyond "today" — this is that history, finally shown.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'technicians:view');
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

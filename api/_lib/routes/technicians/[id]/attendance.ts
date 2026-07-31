import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../../db.js';
import { Technician, TechnicianDoc } from '../../../models/Technician.js';
import { Attendance, AttendanceDoc } from '../../../models/Attendance.js';
import { requireTenantPermission } from '../../../auth.js';
import { serializeTechnician } from '../../../serializers.js';
import { applyAttendanceAction, AttendanceAction, ATTENDANCE_ACTIONS } from '../../../attendance.js';

// clock_in/start_break/end_break/clock_out map onto Technician.status so the
// existing status badge on Technicians.tsx stays meaningful — one write
// path, not a second collection that can drift out of sync with it.
const TECHNICIAN_STATUS: Record<AttendanceAction, TechnicianDoc['status']> = {
  clock_in: 'Available',
  start_break: 'On Break',
  end_break: 'Available',
  clock_out: 'Off Duty',
};

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'technicians:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing technician id' });

  const { action } = (req.body ?? {}) as { action?: AttendanceAction };
  if (!action || !ATTENDANCE_ACTIONS.includes(action)) {
    return res.status(400).json({ error: `action must be one of ${ATTENDANCE_ACTIONS.join(', ')}` });
  }

  await connectToDatabase();

  const technician = await Technician.findOne({ _id: id, clientId: session.clientId });
  if (!technician) return res.status(404).json({ error: 'Technician not found' });

  const date = todayStr();
  let doc = (await Attendance.findOne({ clientId: session.clientId, technicianId: id, date })) as
    | (AttendanceDoc & { save: () => Promise<unknown> })
    | null;

  const now = new Date();
  const result = applyAttendanceAction(doc, action, now);
  if (result) return res.status(400).json({ error: result.error });

  if (!doc) {
    doc = (await Attendance.create({ clientId: session.clientId, technicianId: id, date, status: 'active', clockInAt: now })) as any;
  } else {
    await doc.save();
  }

  const updatedTechnician = await Technician.findOneAndUpdate(
    { _id: id, clientId: session.clientId },
    { status: TECHNICIAN_STATUS[action] },
    { returnDocument: 'after' }
  ).lean();

  return res.status(200).json({
    technician: serializeTechnician(updatedTechnician as TechnicianDoc, undefined, undefined, {
      status: doc!.status,
      clockInAt: doc!.clockInAt ?? undefined,
    }),
  });
}

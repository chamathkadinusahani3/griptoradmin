import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Attendance, AttendanceDoc } from '../../models/Attendance.js';
import { requireTenant } from '../../auth.js';
import { applyAttendanceAction, AttendanceAction, ATTENDANCE_ACTIONS, computeHoursWorked } from '../../attendance.js';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// Self-service clock in/out for ANY staff User — Owner/Manager/Cashier, not
// just Technician resources (which have their own real endpoint, unchanged:
// api/_lib/routes/technicians/[id]/attendance.ts, supervisor-operated).
// Reuses the identical action verbs/state machine (applyAttendanceAction)
// and the same Attendance collection — Attendance.userId, not
// Attendance.technicianId, is what makes this a User-keyed day-record.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'POST') return handlePost(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGet(req: VercelRequest, res: VercelResponse) {
  const session = requireTenant(req, res);
  if (!session) return;

  await connectToDatabase();
  const date = todayStr();
  const doc = (await Attendance.findOne({ clientId: session.clientId, userId: session.sub, date }).lean()) as AttendanceDoc | null;

  return res.status(200).json({
    status: doc?.status ?? 'off',
    clockInAt: doc?.clockInAt,
    clockOutAt: doc?.clockOutAt,
    hoursWorked: doc ? computeHoursWorked(doc) : null,
  });
}

async function handlePost(req: VercelRequest, res: VercelResponse) {
  const session = requireTenant(req, res);
  if (!session) return;

  const { action } = (req.body ?? {}) as { action?: AttendanceAction };
  if (!action || !ATTENDANCE_ACTIONS.includes(action)) {
    return res.status(400).json({ error: `action must be one of ${ATTENDANCE_ACTIONS.join(', ')}` });
  }

  await connectToDatabase();

  const date = todayStr();
  let doc = (await Attendance.findOne({ clientId: session.clientId, userId: session.sub, date })) as
    | (AttendanceDoc & { save: () => Promise<unknown> })
    | null;

  const now = new Date();
  const result = applyAttendanceAction(doc, action, now);
  if (result) return res.status(400).json({ error: result.error });

  if (!doc) {
    doc = (await Attendance.create({ clientId: session.clientId, userId: session.sub, date, status: 'active', clockInAt: now })) as any;
  } else {
    await doc.save();
  }

  return res.status(200).json({
    status: doc!.status,
    clockInAt: doc!.clockInAt,
    clockOutAt: doc!.clockOutAt,
    hoursWorked: computeHoursWorked(doc as unknown as AttendanceDoc),
  });
}

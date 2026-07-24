import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../_lib/db';
import { Technician, TechnicianDoc } from '../../_lib/models/Technician';
import { Attendance, AttendanceDoc } from '../../_lib/models/Attendance';
import { requireTenant } from '../../_lib/auth';
import { serializeTechnician } from '../../_lib/serializers';

type Action = 'clock_in' | 'start_break' | 'end_break' | 'clock_out';
const ACTIONS: Action[] = ['clock_in', 'start_break', 'end_break', 'clock_out'];

// clock_in/start_break/end_break/clock_out map onto Technician.status so the
// existing status badge on Technicians.tsx stays meaningful — one write
// path, not a second collection that can drift out of sync with it.
const TECHNICIAN_STATUS: Record<Action, TechnicianDoc['status']> = {
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

  const session = requireTenant(req, res);
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing technician id' });

  const { action } = (req.body ?? {}) as { action?: Action };
  if (!action || !ACTIONS.includes(action)) {
    return res.status(400).json({ error: `action must be one of ${ACTIONS.join(', ')}` });
  }

  await connectToDatabase();

  const technician = await Technician.findOne({ _id: id, clientId: session.clientId });
  if (!technician) return res.status(404).json({ error: 'Technician not found' });

  const date = todayStr();
  let doc = (await Attendance.findOne({ clientId: session.clientId, technicianId: id, date })) as
    | (AttendanceDoc & { save: () => Promise<unknown> })
    | null;

  if (!doc && (action === 'start_break' || action === 'end_break' || action === 'clock_out')) {
    return res.status(400).json({ error: 'Clock in first' });
  }

  const now = new Date();

  if (action === 'clock_in') {
    if (!doc) {
      doc = (await Attendance.create({ clientId: session.clientId, technicianId: id, date, status: 'active', clockInAt: now })) as any;
    } else {
      doc.status = 'active';
      doc.clockInAt = now;
      await doc.save();
    }
  } else if (action === 'start_break') {
    doc!.status = 'on_break';
    doc!.breakLogs.push({ startedAt: now } as never);
    await doc!.save();
  } else if (action === 'end_break') {
    const open = doc!.breakLogs.find((b) => !b.endedAt);
    if (!open) return res.status(400).json({ error: 'No break is currently open' });
    open.endedAt = now;
    doc!.status = 'active';
    await doc!.save();
  } else if (action === 'clock_out') {
    doc!.status = 'off';
    doc!.clockOutAt = now;
    await doc!.save();
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

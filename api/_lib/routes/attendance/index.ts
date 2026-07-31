import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Attendance, AttendanceDoc } from '../../models/Attendance.js';
import { Technician, TechnicianDoc } from '../../models/Technician.js';
import { User, UserDoc } from '../../models/User.js';
import { requireTenantPermission } from '../../auth.js';
import { computeHoursWorked } from '../../attendance.js';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// Team-wide attendance for one day — combines BOTH Technician-resource rows
// and User (self-service) rows from the same Attendance collection, joined
// with names. Transparent to any staff member (requireTenant), same
// visibility convention already used for Approvals/Leave Requests.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'attendance:view-team');
  if (!session) return;

  await connectToDatabase();
  const { date } = req.query;
  const day = typeof date === 'string' ? date : todayStr();

  const records = (await Attendance.find({ clientId: session.clientId, date: day }).lean()) as AttendanceDoc[];
  const technicianIds = records.filter((r) => r.technicianId).map((r) => r.technicianId!.toString());
  const userIds = records.filter((r) => r.userId).map((r) => r.userId!.toString());

  const [technicians, users] = await Promise.all([
    Technician.find({ _id: { $in: technicianIds } }).lean() as Promise<TechnicianDoc[]>,
    User.find({ _id: { $in: userIds } }).lean() as Promise<UserDoc[]>,
  ]);
  const technicianNameById = new Map(technicians.map((t) => [t._id.toString(), t.name]));
  const userNameById = new Map(users.map((u) => [u._id.toString(), u.name]));

  return res.status(200).json({
    date: day,
    attendance: records.map((r) => ({
      subjectType: r.technicianId ? 'Technician' : 'Staff',
      subjectId: (r.technicianId ?? r.userId)!.toString(),
      name: r.technicianId ? technicianNameById.get(r.technicianId.toString()) : userNameById.get(r.userId!.toString()),
      status: r.status,
      clockInAt: r.clockInAt,
      clockOutAt: r.clockOutAt,
      hoursWorked: computeHoursWorked(r),
    })),
  });
}

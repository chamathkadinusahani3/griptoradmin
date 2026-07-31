import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { LeaveRequest, LeaveRequestDoc, LEAVE_TYPES } from '../../models/LeaveRequest.js';
import { User, UserDoc } from '../../models/User.js';
import { requireTenant, requireTenantPermission } from '../../auth.js';
import { serializeLeaveRequest } from '../../serializers.js';

interface CreateLeaveRequestBody {
  type?: (typeof LEAVE_TYPES)[number];
  startDate?: string;
  endDate?: string;
  reason?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

// Tenant-wide visibility for any staff member, same as Approvals — not
// self-scoped. Only responding (approve/reject) is manager-gated.
async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'leave-requests:view');
  if (!session) return;

  await connectToDatabase();
  const leaves = (await LeaveRequest.find({ clientId: session.clientId }).sort({ createdAt: -1 }).lean()) as LeaveRequestDoc[];
  const userIds = [...new Set(leaves.flatMap((l) => [l.requestedBy.toString(), l.respondedBy?.toString()].filter(Boolean) as string[]))];
  const users = (await User.find({ _id: { $in: userIds } }).lean()) as UserDoc[];
  const userNameById = new Map(users.map((u) => [u._id.toString(), u.name]));

  return res.status(200).json({
    leaveRequests: leaves.map((l) =>
      serializeLeaveRequest(l, userNameById.get(l.requestedBy.toString()), l.respondedBy ? userNameById.get(l.respondedBy.toString()) : undefined)
    ),
  });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = requireTenant(req, res);
  if (!session) return;

  const { type, startDate, endDate, reason } = (req.body ?? {}) as CreateLeaveRequestBody;
  if (!type || !LEAVE_TYPES.includes(type) || !startDate || !endDate) {
    return res.status(400).json({ error: 'A valid type, startDate, and endDate are required' });
  }
  if (new Date(startDate) > new Date(endDate)) {
    return res.status(400).json({ error: 'startDate cannot be after endDate' });
  }

  await connectToDatabase();
  const leave = await LeaveRequest.create({
    clientId: session.clientId,
    requestedBy: session.sub,
    type,
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    reason,
    status: 'Pending',
  });

  const requester = (await User.findById(session.sub).lean()) as UserDoc | null;
  return res.status(201).json({ leaveRequest: serializeLeaveRequest(leave.toObject(), requester?.name) });
}

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { LeaveRequest, LeaveRequestDoc } from '../../models/LeaveRequest.js';
import { User, UserDoc } from '../../models/User.js';
import { requireTenant, hasPermission } from '../../auth.js';
import { serializeLeaveRequest } from '../../serializers.js';

interface RespondBody {
  status?: 'Approved' | 'Rejected' | 'Cancelled';
  responseNote?: string;
}

// Two different actors can PATCH this, each with their own rule — checked
// inline rather than via requireTenantPermission (which would double-respond
// on failure) since only ONE of the two cases needs the manager check:
//   - Owner/Manager: Approved/Rejected on any still-Pending request (same
//     "respondedBy always session.sub, never trusted" discipline as
//     Approvals — the direct fix for that Anura bug class).
//   - The original requester: Cancelled on their OWN still-Pending request.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = requireTenant(req, res);
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing leave request id' });

  const { status, responseNote } = (req.body ?? {}) as RespondBody;
  if (status !== 'Approved' && status !== 'Rejected' && status !== 'Cancelled') {
    return res.status(400).json({ error: 'status must be Approved, Rejected, or Cancelled' });
  }

  await connectToDatabase();

  const existing = (await LeaveRequest.findOne({ _id: id, clientId: session.clientId }).lean()) as LeaveRequestDoc | null;
  if (!existing) return res.status(404).json({ error: 'Leave request not found' });
  if (existing.status !== 'Pending') {
    return res.status(400).json({ error: 'This request has already been responded to' });
  }

  const update: Record<string, unknown> = { status };

  if (status === 'Cancelled') {
    if (existing.requestedBy.toString() !== session.sub) {
      return res.status(403).json({ error: 'Only the original requester can cancel this request' });
    }
  } else {
    if (!(await hasPermission(session, 'leave-requests:respond'))) {
      return res.status(403).json({ error: 'You don\'t have permission to respond to leave requests' });
    }
    update.respondedBy = session.sub;
    update.respondedAt = new Date();
    update.responseNote = responseNote;
  }

  const leave = (await LeaveRequest.findOneAndUpdate({ _id: id, clientId: session.clientId }, update, {
    returnDocument: 'after',
  }).lean()) as LeaveRequestDoc;

  const users = (await User.find({ _id: { $in: [leave.requestedBy, leave.respondedBy].filter(Boolean) } }).lean()) as UserDoc[];
  const userNameById = new Map(users.map((u) => [u._id.toString(), u.name]));

  return res.status(200).json({
    leaveRequest: serializeLeaveRequest(
      leave,
      userNameById.get(leave.requestedBy.toString()),
      leave.respondedBy ? userNameById.get(leave.respondedBy.toString()) : undefined
    ),
  });
}

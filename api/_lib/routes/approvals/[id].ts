import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Approval, ApprovalDoc } from '../../models/Approval.js';
import { User, UserDoc } from '../../models/User.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeApproval } from '../../serializers.js';

interface RespondBody {
  status?: 'Approved' | 'Rejected';
  notes?: string;
}

// The direct fix for Anura's confirmed bug: `respondedBy` here is ALWAYS
// session.sub, never anything the client sends — Anura's version hardcodes
// the literal string 'Manager' client-side and has no server auth at all,
// so any caller could respond as anyone. Now that real tenant staff
// accounts/roles exist, this also requires the responder's own tenantRole
// to be Owner/Manager (requireTenantPermission) — the true multi-approver
// enforcement the original Phase 8 note flagged as not yet possible.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'approvals:respond');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing approval id' });

  const { status, notes } = (req.body ?? {}) as RespondBody;
  if (status !== 'Approved' && status !== 'Rejected') {
    return res.status(400).json({ error: 'status must be Approved or Rejected' });
  }

  await connectToDatabase();

  const existing = await Approval.findOne({ _id: id, clientId: session.clientId }).lean();
  if (!existing) return res.status(404).json({ error: 'Approval not found' });
  if (existing.status !== 'Pending') {
    return res.status(400).json({ error: 'This request has already been responded to' });
  }

  const approval = (await Approval.findOneAndUpdate(
    { _id: id, clientId: session.clientId },
    { status, notes, respondedBy: session.sub, respondedAt: new Date() },
    { returnDocument: 'after' }
  ).lean()) as ApprovalDoc;

  const users = (await User.find({ _id: { $in: [approval.requestedBy, approval.respondedBy] } }).lean()) as UserDoc[];
  const userNameById = new Map(users.map((u) => [u._id.toString(), u.name]));

  return res.status(200).json({
    approval: serializeApproval(approval, userNameById.get(approval.requestedBy.toString()), userNameById.get(approval.respondedBy!.toString())),
  });
}

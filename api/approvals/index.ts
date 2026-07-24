import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../_lib/db';
import { Approval, ApprovalDoc } from '../_lib/models/Approval';
import { User, UserDoc } from '../_lib/models/User';
import { requireTenant } from '../_lib/auth';
import { serializeApproval } from '../_lib/serializers';

const APPROVAL_TYPES = ['Discount Authorization', 'Refund Request', 'Credit Limit Override', 'Warranty Claim', 'Other'] as const;

interface CreateApprovalBody {
  type?: (typeof APPROVAL_TYPES)[number];
  subject?: string;
  amount?: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = requireTenant(req, res);
  if (!session) return;

  await connectToDatabase();
  const approvals = (await Approval.find({ clientId: session.clientId }).sort({ createdAt: -1 }).lean()) as ApprovalDoc[];
  const userIds = [...new Set(approvals.flatMap((a) => [a.requestedBy.toString(), a.respondedBy?.toString()].filter(Boolean) as string[]))];
  const users = (await User.find({ _id: { $in: userIds } }).lean()) as UserDoc[];
  const userNameById = new Map(users.map((u) => [u._id.toString(), u.name]));

  return res.status(200).json({
    approvals: approvals.map((a) =>
      serializeApproval(a, userNameById.get(a.requestedBy.toString()), a.respondedBy ? userNameById.get(a.respondedBy.toString()) : undefined)
    ),
  });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = requireTenant(req, res);
  if (!session) return;

  const { type, subject, amount } = (req.body ?? {}) as CreateApprovalBody;
  if (!type || !APPROVAL_TYPES.includes(type) || !subject) {
    return res.status(400).json({ error: 'A valid type and subject are required' });
  }

  await connectToDatabase();
  const approval = await Approval.create({
    clientId: session.clientId,
    type,
    subject,
    amount,
    requestedBy: session.sub,
    status: 'Pending',
  });

  const requester = (await User.findById(session.sub).lean()) as UserDoc | null;
  return res.status(201).json({ approval: serializeApproval(approval.toObject(), requester?.name) });
}

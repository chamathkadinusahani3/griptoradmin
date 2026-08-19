import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Followup, FollowupDoc } from '../../models/Followup.js';
import { User } from '../../models/User.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeFollowup } from '../../serializers.js';

interface UpdateFollowupBody {
  action?: 'complete' | 'cancel';
  dueDate?: string;
  assignedTo?: string | null;
  notes?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'followups:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing follow-up id' });

  await connectToDatabase();

  const existing = (await Followup.findOne({ _id: id, clientId: session.clientId }).lean()) as FollowupDoc | null;
  if (!existing) return res.status(404).json({ error: 'Follow-up not found' });

  const body = (req.body ?? {}) as UpdateFollowupBody;
  const update: Record<string, unknown> = {};

  if (body.action === 'complete' || body.action === 'cancel') {
    if (existing.status !== 'Pending') {
      return res.status(400).json({ error: 'Only a Pending follow-up can be completed or cancelled' });
    }
    update.status = body.action === 'complete' ? 'Completed' : 'Cancelled';
    if (body.action === 'complete') update.completedAt = new Date();
  } else {
    if (existing.status !== 'Pending') {
      return res.status(400).json({ error: 'Only a Pending follow-up can be rescheduled or reassigned' });
    }
    if (body.dueDate !== undefined) update.dueDate = new Date(body.dueDate);
    if (body.assignedTo !== undefined) update.assignedTo = body.assignedTo || undefined;
    if (body.notes !== undefined) update.notes = body.notes;
    if (Object.keys(update).length === 0) return res.status(400).json({ error: 'No changes provided' });
  }

  const followup = (await Followup.findOneAndUpdate(
    { _id: id, clientId: session.clientId },
    update,
    { returnDocument: 'after' }
  ).lean()) as FollowupDoc;

  const assignedUser = followup.assignedTo ? ((await User.findById(followup.assignedTo).select('name').lean()) as { name: string } | null) : null;
  return res.status(200).json({ followup: serializeFollowup(followup, assignedUser?.name) });
}

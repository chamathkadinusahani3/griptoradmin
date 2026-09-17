import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { CollectionTask, CollectionTaskDoc } from '../../models/CollectionTask.js';
import { User, UserDoc } from '../../models/User.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeCollectionTask } from '../../serializers.js';

type Action = 'contact' | 'promise' | 'collect' | 'fail' | 'reassign' | 'note';

interface UpdateCollectionTaskBody {
  action?: Action;
  promiseDate?: string;
  promiseAmount?: number;
  collectedAmount?: number;
  failReason?: string;
  assignedTo?: string;
  notes?: string;
}

const TERMINAL_STATUSES = ['Collected', 'Failed'];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'collection-tasks:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing collection task id' });

  const body = (req.body ?? {}) as UpdateCollectionTaskBody;
  if (!body.action) return res.status(400).json({ error: 'action is required' });

  await connectToDatabase();

  const existing = (await CollectionTask.findOne({ _id: id, clientId: session.clientId }).lean()) as CollectionTaskDoc | null;
  if (!existing) return res.status(404).json({ error: 'Collection task not found' });
  if (TERMINAL_STATUSES.includes(existing.status)) {
    return res.status(400).json({ error: `This task is already ${existing.status} and can no longer be changed` });
  }

  const update: Record<string, unknown> = {};

  switch (body.action) {
    case 'contact':
      if (existing.status !== 'Pending') return res.status(400).json({ error: 'Only a Pending task can be marked Contacted' });
      update.status = 'Contacted';
      update.contactDate = new Date();
      break;
    case 'promise':
      if (existing.status !== 'Pending' && existing.status !== 'Contacted') {
        return res.status(400).json({ error: 'A promise to pay can only be logged from Pending or Contacted' });
      }
      if (!body.promiseDate || body.promiseAmount == null || body.promiseAmount <= 0) {
        return res.status(400).json({ error: 'A promiseDate and a positive promiseAmount are required' });
      }
      update.status = 'Promise to Pay';
      update.promiseDate = new Date(body.promiseDate);
      update.promiseAmount = body.promiseAmount;
      break;
    case 'collect':
      if (body.collectedAmount == null || body.collectedAmount <= 0) {
        return res.status(400).json({ error: 'A positive collectedAmount is required' });
      }
      update.status = 'Collected';
      update.collectedAmount = body.collectedAmount;
      break;
    case 'fail':
      update.status = 'Failed';
      if (body.failReason !== undefined) update.failReason = body.failReason;
      break;
    case 'reassign':
      if (!body.assignedTo) return res.status(400).json({ error: 'assignedTo is required' });
      {
        const assignee = (await User.findOne({ _id: body.assignedTo, clientId: session.clientId, role: 'tenant' }).lean()) as UserDoc | null;
        if (!assignee) return res.status(400).json({ error: 'Unknown staff member' });
      }
      update.assignedTo = body.assignedTo;
      break;
    case 'note':
      break;
    default:
      return res.status(400).json({ error: 'Unknown action' });
  }

  if (body.notes !== undefined) update.notes = body.notes;
  if (Object.keys(update).length === 0) return res.status(400).json({ error: 'No changes provided' });

  const task = (await CollectionTask.findOneAndUpdate(
    { _id: id, clientId: session.clientId },
    update,
    { returnDocument: 'after' }
  ).lean()) as CollectionTaskDoc;

  const users = (await User.find({ _id: { $in: [task.assignedTo, task.createdBy] } }).select('name').lean()) as UserDoc[];
  const nameById = new Map(users.map((u) => [(u._id as { toString(): string }).toString(), u.name]));

  return res.status(200).json({
    collectionTask: serializeCollectionTask(task, nameById.get(task.assignedTo.toString()), nameById.get(task.createdBy.toString())),
  });
}

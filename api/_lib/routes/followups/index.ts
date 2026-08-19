import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Followup, FollowupDoc, FOLLOWUP_TYPES } from '../../models/Followup.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { Prospect, ProspectDoc } from '../../models/Prospect.js';
import { User, UserDoc } from '../../models/User.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeFollowup } from '../../serializers.js';

interface CreateFollowupBody {
  customerId?: string;
  prospectId?: string;
  dueDate?: string;
  type?: string;
  assignedTo?: string;
  notes?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'followups:view');
  if (!session) return;

  await connectToDatabase();
  const { customerId, prospectId } = req.query;
  const filter: Record<string, unknown> = { clientId: session.clientId };
  if (typeof customerId === 'string') filter.customerId = customerId;
  if (typeof prospectId === 'string') filter.prospectId = prospectId;

  const followups = (await Followup.find(filter).sort({ dueDate: 1 }).lean()) as FollowupDoc[];
  const userIds = [...new Set(followups.map((f) => f.assignedTo?.toString()).filter(Boolean) as string[])];
  const users = (await User.find({ _id: { $in: userIds } }).select('name').lean()) as UserDoc[];
  const nameById = new Map(users.map((u) => [u._id.toString(), u.name]));

  return res.status(200).json({
    followups: followups.map((f) => serializeFollowup(f, f.assignedTo ? nameById.get(f.assignedTo.toString()) : undefined)),
  });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'followups:manage');
  if (!session) return;

  const { customerId, prospectId, dueDate, type, assignedTo, notes } = (req.body ?? {}) as CreateFollowupBody;
  if ((!customerId && !prospectId) || (customerId && prospectId)) {
    return res.status(400).json({ error: 'Exactly one of customerId or prospectId is required' });
  }
  if (!dueDate) return res.status(400).json({ error: 'dueDate is required' });
  if (type !== undefined && !(FOLLOWUP_TYPES as readonly string[]).includes(type)) {
    return res.status(400).json({ error: `type must be one of: ${FOLLOWUP_TYPES.join(', ')}` });
  }

  await connectToDatabase();

  let subjectName: string;
  if (customerId) {
    const customer = (await Customer.findOne({ _id: customerId, clientId: session.clientId }).lean()) as CustomerDoc | null;
    if (!customer) return res.status(400).json({ error: 'Unknown customer' });
    subjectName = customer.name;
  } else {
    const prospect = (await Prospect.findOne({ _id: prospectId, clientId: session.clientId }).lean()) as ProspectDoc | null;
    if (!prospect) return res.status(400).json({ error: 'Unknown prospect' });
    subjectName = prospect.name;
  }

  const followup = await Followup.create({
    clientId: session.clientId,
    customerId: customerId || undefined,
    prospectId: prospectId || undefined,
    subjectName,
    dueDate: new Date(dueDate),
    type: type || 'Call',
    assignedTo: assignedTo || undefined,
    notes,
  });

  return res.status(201).json({ followup: serializeFollowup(followup.toObject()) });
}

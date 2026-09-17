import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { CollectionTask, CollectionTaskDoc } from '../../models/CollectionTask.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { User, UserDoc } from '../../models/User.js';
import { requireTenantPermission } from '../../auth.js';
import { getCustomerInvoicesAndTotals } from '../../dealerMetrics.js';
import { serializeCollectionTask } from '../../serializers.js';

interface CreateCollectionTaskBody {
  customerId?: string;
  assignedTo?: string;
  notes?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function withNames(tasks: CollectionTaskDoc[]) {
  if (tasks.length === 0) return [];
  const userIds = [...new Set(tasks.flatMap((t) => [t.assignedTo.toString(), t.createdBy.toString()]))];
  const users = (await User.find({ _id: { $in: userIds } }).select('name').lean()) as { _id: { toString(): string }; name: string }[];
  const nameById = new Map(users.map((u) => [u._id.toString(), u.name]));
  return tasks.map((t) => serializeCollectionTask(t, nameById.get(t.assignedTo.toString()), nameById.get(t.createdBy.toString())));
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'collection-tasks:view');
  if (!session) return;

  await connectToDatabase();
  const { status, assignedTo } = req.query;
  const filter: Record<string, unknown> = { clientId: session.clientId };
  if (typeof status === 'string') filter.status = status;
  if (typeof assignedTo === 'string') filter.assignedTo = assignedTo;

  const tasks = (await CollectionTask.find(filter).sort({ createdAt: -1 }).lean()) as CollectionTaskDoc[];
  return res.status(200).json({ collectionTasks: await withNames(tasks) });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'collection-tasks:manage');
  if (!session) return;

  const { customerId, assignedTo, notes } = (req.body ?? {}) as CreateCollectionTaskBody;
  if (!customerId || !assignedTo) return res.status(400).json({ error: 'customerId and assignedTo are required' });

  await connectToDatabase();

  const customer = (await Customer.findOne({ _id: customerId, clientId: session.clientId }).lean()) as CustomerDoc | null;
  if (!customer) return res.status(400).json({ error: 'Unknown customer' });

  const assignee = (await User.findOne({ _id: assignedTo, clientId: session.clientId, role: 'tenant' }).lean()) as UserDoc | null;
  if (!assignee) return res.status(400).json({ error: 'Unknown staff member' });

  // Always server-computed from live invoices (same source ar-aging.ts
  // uses) — never trusted from the client, same discipline as every other
  // financial figure in this codebase.
  const { totalOutstanding } = await getCustomerInvoicesAndTotals(session.clientId, customerId);

  const task = await CollectionTask.create({
    clientId: session.clientId,
    customerId,
    customerName: customer.name,
    outstandingAmountAtCreation: totalOutstanding,
    assignedTo,
    createdBy: session.sub,
    notes,
  });

  const [serialized] = await withNames([task.toObject() as CollectionTaskDoc]);
  return res.status(201).json({ collectionTask: serialized });
}

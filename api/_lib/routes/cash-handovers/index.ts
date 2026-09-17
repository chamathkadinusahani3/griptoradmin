import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { CashHandover, CashHandoverDoc } from '../../models/CashHandover.js';
import { User } from '../../models/User.js';
import { requireTenantPermission } from '../../auth.js';
import { resolveBranchFilter } from '../../branch.js';
import { generateSequentialNumber } from '../../numbering.js';
import { serializeCashHandover } from '../../serializers.js';

interface CreateCashHandoverBody {
  branchId?: string;
  handedOverBy?: string;
  receivedBy?: string;
  amount?: number;
  date?: string;
  notes?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function withNames(clientId: string, handovers: CashHandoverDoc[]) {
  if (handovers.length === 0) return [];
  const userIds = [...new Set(handovers.flatMap((h) => [h.handedOverBy.toString(), h.receivedBy.toString()]))];
  const users = (await User.find({ _id: { $in: userIds }, clientId }).select('name').lean()) as { _id: { toString(): string }; name: string }[];
  const nameById = new Map(users.map((u) => [u._id.toString(), u.name]));
  return handovers.map((h) => serializeCashHandover(h, nameById.get(h.handedOverBy.toString()), nameById.get(h.receivedBy.toString())));
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'cash-handovers:view');
  if (!session) return;

  await connectToDatabase();
  const { branchId } = req.query;
  const effectiveBranchId = resolveBranchFilter(session, typeof branchId === 'string' ? branchId : undefined);
  const filter: Record<string, unknown> = { clientId: session.clientId };
  if (effectiveBranchId) filter.branchId = effectiveBranchId;

  const handovers = (await CashHandover.find(filter).sort({ createdAt: -1 }).lean()) as CashHandoverDoc[];
  return res.status(200).json({ cashHandovers: await withNames(session.clientId, handovers) });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'cash-handovers:manage');
  if (!session) return;

  const { branchId: requestedBranchId, handedOverBy, receivedBy, amount, date, notes } = (req.body ?? {}) as CreateCashHandoverBody;

  if (!handedOverBy || !receivedBy) return res.status(400).json({ error: 'handedOverBy and receivedBy are required' });
  if (handedOverBy === receivedBy) return res.status(400).json({ error: 'handedOverBy and receivedBy must be different people' });
  if (amount == null || amount <= 0) return res.status(400).json({ error: 'A positive amount is required' });
  if (!date) return res.status(400).json({ error: 'date is required' });

  await connectToDatabase();

  const [handedOverUser, receivedUser] = await Promise.all([
    User.findOne({ _id: handedOverBy, clientId: session.clientId }).select('name').lean(),
    User.findOne({ _id: receivedBy, clientId: session.clientId }).select('name').lean(),
  ]);
  if (!handedOverUser) return res.status(400).json({ error: 'Unknown handedOverBy staff member' });
  if (!receivedUser) return res.status(400).json({ error: 'Unknown receivedBy staff member' });

  const branchId = resolveBranchFilter(session, requestedBranchId);
  const cashHandoverNumber = await generateSequentialNumber(CashHandover, session.clientId, 'cashHandoverNumber', 'cashHandover');

  const handover = await CashHandover.create({
    clientId: session.clientId,
    cashHandoverNumber,
    branchId: branchId || undefined,
    handedOverBy,
    receivedBy,
    amount,
    date: new Date(date),
    notes,
  });

  const [serialized] = await withNames(session.clientId, [handover.toObject() as CashHandoverDoc]);
  return res.status(201).json({ cashHandover: serialized });
}

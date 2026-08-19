import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { CashSession, CashSessionDoc } from '../../models/CashSession.js';
import { User, UserDoc } from '../../models/User.js';
import { requireTenantPermission } from '../../auth.js';
import { isValidBranch } from '../../branch.js';
import { serializeCashSession } from '../../serializers.js';

interface OpenSessionBody {
  branchId?: string;
  openingFloat?: number;
  notes?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleOpen(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'bank-accounts:view');
  if (!session) return;

  await connectToDatabase();
  const sessions = (await CashSession.find({ clientId: session.clientId }).sort({ createdAt: -1 }).lean()) as CashSessionDoc[];
  const userIds = [...new Set(sessions.flatMap((s) => [s.openedBy.toString(), s.closedBy?.toString()].filter(Boolean) as string[]))];
  const users = (await User.find({ _id: { $in: userIds } }).select('name').lean()) as UserDoc[];
  const nameById = new Map(users.map((u) => [u._id.toString(), u.name]));

  return res.status(200).json({
    cashSessions: sessions.map((s) =>
      serializeCashSession(s, nameById.get(s.openedBy.toString()), s.closedBy ? nameById.get(s.closedBy.toString()) : undefined)
    ),
  });
}

async function handleOpen(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'bank-accounts:manage');
  if (!session) return;

  const { branchId, openingFloat, notes } = (req.body ?? {}) as OpenSessionBody;
  if (openingFloat == null || openingFloat < 0) {
    return res.status(400).json({ error: 'A non-negative openingFloat is required' });
  }

  await connectToDatabase();

  if (branchId && !(await isValidBranch(session.clientId, branchId))) {
    return res.status(400).json({ error: 'Unknown branch' });
  }

  // Only one Open session per branch (or per tenant, if branchless) at a
  // time — otherwise two sessions would double-count the same Sale/Expense
  // records when each closes.
  const alreadyOpen = await CashSession.findOne({ clientId: session.clientId, branchId: branchId || { $exists: false }, status: 'Open' }).lean();
  if (alreadyOpen) return res.status(400).json({ error: 'A cash session is already open for this branch — close it first' });

  const cashSession = await CashSession.create({
    clientId: session.clientId,
    branchId: branchId || undefined,
    openedBy: session.sub,
    openingFloat,
    notes,
  });

  const opener = (await User.findById(session.sub).select('name').lean()) as { name: string } | null;
  return res.status(201).json({ cashSession: serializeCashSession(cashSession.toObject(), opener?.name) });
}

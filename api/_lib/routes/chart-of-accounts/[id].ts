import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { ChartOfAccounts, ChartOfAccountsDoc } from '../../models/ChartOfAccounts.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeChartOfAccount } from '../../serializers.js';

interface UpdateAccountBody {
  name?: string;
  description?: string;
  active?: boolean;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'PATCH') return handleUpdate(req, res);
  if (req.method === 'DELETE') return handleDelete(req, res);
  res.setHeader('Allow', 'PATCH, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleUpdate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'bank-accounts:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing account id' });

  const body = (req.body ?? {}) as UpdateAccountBody;
  const update: Record<string, unknown> = {};
  if (body.name !== undefined && body.name.trim()) update.name = body.name.trim();
  if (body.description !== undefined) update.description = body.description;
  if (body.active !== undefined) update.active = body.active;

  await connectToDatabase();

  const account = (await ChartOfAccounts.findOneAndUpdate(
    { _id: id, clientId: session.clientId },
    update,
    { returnDocument: 'after' }
  ).lean()) as ChartOfAccountsDoc | null;
  if (!account) return res.status(404).json({ error: 'Account not found' });

  return res.status(200).json({ account: serializeChartOfAccount(account) });
}

async function handleDelete(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'bank-accounts:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing account id' });

  await connectToDatabase();

  const existing = (await ChartOfAccounts.findOne({ _id: id, clientId: session.clientId }).lean()) as ChartOfAccountsDoc | null;
  if (!existing) return res.status(404).json({ error: 'Account not found' });
  if (existing.isSystem) return res.status(400).json({ error: 'A default system account cannot be deleted — deactivate it instead' });

  await ChartOfAccounts.deleteOne({ _id: id, clientId: session.clientId });
  return res.status(204).end();
}

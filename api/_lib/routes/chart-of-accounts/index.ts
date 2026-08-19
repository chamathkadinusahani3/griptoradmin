import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { ChartOfAccounts, ChartOfAccountsDoc, ACCOUNT_TYPES } from '../../models/ChartOfAccounts.js';
import { requireTenantPermission } from '../../auth.js';
import { ensureDefaultChartOfAccounts } from '../../chartOfAccountsSeed.js';
import { serializeChartOfAccount } from '../../serializers.js';

interface CreateAccountBody {
  code?: string;
  name?: string;
  type?: string;
  description?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'bank-accounts:view');
  if (!session) return;

  await connectToDatabase();
  await ensureDefaultChartOfAccounts(session.clientId);
  const accounts = (await ChartOfAccounts.find({ clientId: session.clientId }).sort({ code: 1 }).lean()) as ChartOfAccountsDoc[];
  return res.status(200).json({ accounts: accounts.map(serializeChartOfAccount) });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'bank-accounts:manage');
  if (!session) return;

  const { code, name, type, description } = (req.body ?? {}) as CreateAccountBody;
  if (!code || !name || !type || !(ACCOUNT_TYPES as readonly string[]).includes(type)) {
    return res.status(400).json({ error: `code, name, and a valid type (${ACCOUNT_TYPES.join(', ')}) are required` });
  }

  await connectToDatabase();

  const existing = await ChartOfAccounts.findOne({ clientId: session.clientId, code }).lean();
  if (existing) return res.status(409).json({ error: `An account with code ${code} already exists` });

  const account = await ChartOfAccounts.create({ clientId: session.clientId, code, name, type, description, isSystem: false });
  return res.status(201).json({ account: serializeChartOfAccount(account.toObject()) });
}

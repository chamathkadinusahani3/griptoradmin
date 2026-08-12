import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { BankAccount, BankAccountDoc } from '../../models/BankAccount.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeBankAccount } from '../../serializers.js';

interface CreateBankAccountBody {
  bankName?: string;
  accountNumber?: string;
  accountHolderName?: string;
  branch?: string;
  notes?: string;
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
  const accounts = (await BankAccount.find({ clientId: session.clientId }).sort({ createdAt: 1 }).lean()) as BankAccountDoc[];
  return res.status(200).json({ bankAccounts: accounts.map(serializeBankAccount) });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'bank-accounts:manage');
  if (!session) return;

  const { bankName, accountNumber, accountHolderName, branch, notes } = (req.body ?? {}) as CreateBankAccountBody;
  if (!bankName || !accountNumber) {
    return res.status(400).json({ error: 'bankName and accountNumber are required' });
  }

  await connectToDatabase();
  const account = await BankAccount.create({
    clientId: session.clientId,
    bankName,
    accountNumber,
    accountHolderName,
    branch,
    notes,
  });

  return res.status(201).json({ bankAccount: serializeBankAccount(account.toObject()) });
}

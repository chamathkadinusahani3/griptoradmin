import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { BankAccount, BankAccountDoc } from '../../models/BankAccount.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeBankAccount } from '../../serializers.js';

interface UpdateBankAccountBody {
  bankName?: string;
  accountNumber?: string;
  accountHolderName?: string;
  branch?: string;
  notes?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'bank-accounts:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing bank account id' });

  const body = (req.body ?? {}) as UpdateBankAccountBody;
  if (body.bankName !== undefined && !body.bankName.trim()) {
    return res.status(400).json({ error: 'bankName cannot be empty' });
  }
  if (body.accountNumber !== undefined && !body.accountNumber.trim()) {
    return res.status(400).json({ error: 'accountNumber cannot be empty' });
  }

  await connectToDatabase();

  const update: Record<string, unknown> = {};
  for (const key of ['bankName', 'accountNumber', 'accountHolderName', 'branch', 'notes'] as const) {
    if (body[key] !== undefined) update[key] = body[key];
  }

  const account = (await BankAccount.findOneAndUpdate(
    { _id: id, clientId: session.clientId },
    update,
    { returnDocument: 'after' }
  ).lean()) as BankAccountDoc | null;
  if (!account) return res.status(404).json({ error: 'Bank account not found' });

  return res.status(200).json({ bankAccount: serializeBankAccount(account) });
}

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Expense, ExpenseDoc, EXPENSE_CATEGORIES } from '../../models/Expense.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeExpense } from '../../serializers.js';

interface UpdateExpenseBody {
  category?: string;
  description?: string;
  amount?: number;
  date?: string;
  vendorName?: string;
  notes?: string;
  paymentMethod?: 'Cash' | 'Card' | 'Bank Transfer' | 'Cheque' | 'Other';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'expenses:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing expense id' });

  await connectToDatabase();

  if (req.method === 'PATCH') {
    const existing = await Expense.findOne({ _id: id, clientId: session.clientId }).lean();
    if (!existing) return res.status(404).json({ error: 'Expense not found' });

    const body = (req.body ?? {}) as UpdateExpenseBody;
    if (body.category !== undefined && !(EXPENSE_CATEGORIES as readonly string[]).includes(body.category)) {
      return res.status(400).json({ error: `category must be one of: ${EXPENSE_CATEGORIES.join(', ')}` });
    }
    if (body.amount !== undefined && body.amount <= 0) {
      return res.status(400).json({ error: 'amount must be positive' });
    }

    const update: Record<string, unknown> = {};
    for (const key of ['category', 'description', 'vendorName', 'notes', 'amount', 'paymentMethod'] as const) {
      if (body[key] !== undefined) update[key] = body[key];
    }
    if (body.date !== undefined) update.date = new Date(body.date);

    const expense = (await Expense.findOneAndUpdate({ _id: id, clientId: session.clientId }, update, {
      returnDocument: 'after',
    }).lean()) as ExpenseDoc;
    return res.status(200).json({ expense: serializeExpense(expense) });
  }

  if (req.method === 'DELETE') {
    const deleted = await Expense.findOneAndDelete({ _id: id, clientId: session.clientId }).lean();
    if (!deleted) return res.status(404).json({ error: 'Expense not found' });
    return res.status(204).end();
  }

  res.setHeader('Allow', 'PATCH, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

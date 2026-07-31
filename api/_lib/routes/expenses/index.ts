import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Expense, ExpenseDoc, EXPENSE_CATEGORIES } from '../../models/Expense.js';
import { requireTenantPermission } from '../../auth.js';
import { resolveBranchFilter } from '../../branch.js';
import { generateSequentialNumber } from '../../numbering.js';
import { serializeExpense } from '../../serializers.js';

interface CreateExpenseBody {
  category?: string;
  description?: string;
  amount?: number;
  date?: string;
  branchId?: string;
  vendorName?: string;
  notes?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'expenses:view');
  if (!session) return;

  await connectToDatabase();
  const { category, from, to, branchId } = req.query;
  const effectiveBranchId = resolveBranchFilter(session, typeof branchId === 'string' ? branchId : undefined);
  const filter: Record<string, unknown> = { clientId: session.clientId };
  if (effectiveBranchId) filter.branchId = effectiveBranchId;
  if (typeof category === 'string') filter.category = category;
  if (typeof from === 'string' || typeof to === 'string') {
    const dateFilter: Record<string, Date> = {};
    if (typeof from === 'string') dateFilter.$gte = new Date(from);
    if (typeof to === 'string') dateFilter.$lte = new Date(to);
    filter.date = dateFilter;
  }

  const expenses = (await Expense.find(filter).sort({ date: -1 }).lean()) as ExpenseDoc[];
  return res.status(200).json({ expenses: expenses.map(serializeExpense) });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'expenses:manage');
  if (!session) return;

  const { category, description, amount, date, branchId: requestedBranchId, vendorName, notes } = (req.body ?? {}) as CreateExpenseBody;
  if (!category || !(EXPENSE_CATEGORIES as readonly string[]).includes(category)) {
    return res.status(400).json({ error: `category must be one of: ${EXPENSE_CATEGORIES.join(', ')}` });
  }
  if (!description || amount == null || amount <= 0 || !date) {
    return res.status(400).json({ error: 'description, a positive amount, and date are required' });
  }

  await connectToDatabase();
  const branchId = resolveBranchFilter(session, requestedBranchId);
  const expenseNumber = await generateSequentialNumber(Expense, session.clientId, 'expenseNumber', 'EXP');

  const expense = await Expense.create({
    clientId: session.clientId,
    branchId: branchId || undefined,
    expenseNumber,
    category,
    description,
    amount,
    date: new Date(date),
    vendorName,
    notes,
  });

  return res.status(201).json({ expense: serializeExpense(expense.toObject()) });
}

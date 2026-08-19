import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../../db.js';
import { CashSession, CashSessionDoc } from '../../../models/CashSession.js';
import { Sale, SaleDoc } from '../../../models/Sale.js';
import { Expense, ExpenseDoc } from '../../../models/Expense.js';
import { CustomerInvoice, CustomerInvoiceDoc } from '../../../models/CustomerInvoice.js';
import { PurchaseOrder, PurchaseOrderDoc } from '../../../models/PurchaseOrder.js';
import { User } from '../../../models/User.js';
import { requireTenantPermission } from '../../../auth.js';
import { serializeCashSession } from '../../../serializers.js';

interface CloseSessionBody {
  closingCountedAmount?: number;
  notes?: string;
}

// Expected cash in/out is DERIVED here, at close time, from every Cash-
// method record dated within [openedAt, now] — not tracked as the session
// goes, so opening a session has zero effect on any existing checkout/
// payment/expense flow. See CashSession.ts's own comment for why.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'bank-accounts:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing cash session id' });

  const { closingCountedAmount, notes } = (req.body ?? {}) as CloseSessionBody;
  if (closingCountedAmount == null || closingCountedAmount < 0) {
    return res.status(400).json({ error: 'A non-negative closingCountedAmount is required' });
  }

  await connectToDatabase();

  const existing = (await CashSession.findOne({ _id: id, clientId: session.clientId }).lean()) as CashSessionDoc | null;
  if (!existing) return res.status(404).json({ error: 'Cash session not found' });
  if (existing.status !== 'Open') return res.status(400).json({ error: 'This cash session is already closed' });

  const openedAt = (existing as unknown as { createdAt: Date }).createdAt;
  const closedAt = new Date();
  const branchFilter = existing.branchId ? { branchId: existing.branchId } : {};

  const [sales, expenses, invoices, orders] = await Promise.all([
    Sale.find({ clientId: session.clientId, paymentMethod: 'Cash', createdAt: { $gte: openedAt, $lte: closedAt }, ...branchFilter }).lean() as Promise<
      SaleDoc[]
    >,
    Expense.find({ clientId: session.clientId, paymentMethod: 'Cash', date: { $gte: openedAt, $lte: closedAt }, ...branchFilter }).lean() as Promise<
      ExpenseDoc[]
    >,
    CustomerInvoice.find({ clientId: session.clientId, 'paymentHistory.0': { $exists: true } }).lean() as Promise<CustomerInvoiceDoc[]>,
    PurchaseOrder.find({ clientId: session.clientId, 'paymentHistory.0': { $exists: true } }).lean() as Promise<PurchaseOrderDoc[]>,
  ]);

  let cashIn = sales.reduce((sum, s) => sum + s.total, 0);
  for (const inv of invoices) {
    for (const p of inv.paymentHistory) {
      if (p.method === 'Cash' && p.date >= openedAt && p.date <= closedAt) cashIn += p.amount;
    }
  }

  let cashOut = expenses.reduce((sum, e) => sum + e.amount, 0);
  for (const order of orders) {
    for (const p of order.paymentHistory) {
      if (p.method === 'Cash' && p.date >= openedAt && p.date <= closedAt) cashOut += p.amount;
    }
  }

  cashIn = Math.round(cashIn * 100) / 100;
  cashOut = Math.round(cashOut * 100) / 100;
  const expectedClosingAmount = Math.round((existing.openingFloat + cashIn - cashOut) * 100) / 100;
  const variance = Math.round((closingCountedAmount - expectedClosingAmount) * 100) / 100;

  const updated = (await CashSession.findOneAndUpdate(
    { _id: id, clientId: session.clientId, status: 'Open' },
    {
      status: 'Closed',
      closedBy: session.sub,
      closedAt,
      expectedCashIn: cashIn,
      expectedCashOut: cashOut,
      expectedClosingAmount,
      closingCountedAmount,
      variance,
      notes: notes !== undefined ? notes : existing.notes,
    },
    { returnDocument: 'after' }
  ).lean()) as CashSessionDoc;

  const users = (await User.find({ _id: { $in: [updated.openedBy, updated.closedBy] } }).select('name').lean()) as { _id: unknown; name: string }[];
  const nameById = new Map(users.map((u) => [(u._id as { toString(): string }).toString(), u.name]));

  return res.status(200).json({
    cashSession: serializeCashSession(updated, nameById.get(updated.openedBy.toString()), nameById.get(updated.closedBy!.toString())),
  });
}

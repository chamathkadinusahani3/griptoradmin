import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Sale, SaleDoc } from '../../models/Sale.js';
import { CustomerInvoice, CustomerInvoiceDoc } from '../../models/CustomerInvoice.js';
import { Expense, ExpenseDoc } from '../../models/Expense.js';
import { PurchaseOrder, PurchaseOrderDoc } from '../../models/PurchaseOrder.js';
import { PayrollRun, PayrollRunDoc } from '../../models/PayrollRun.js';
import { Return, ReturnDoc } from '../../models/Return.js';
import { requireTenantPermission } from '../../auth.js';

const RANGE_DAYS: Record<string, number> = { '30': 30, '90': 90, '365': 365 };

function resolveRange(req: VercelRequest): { from: Date; to: Date } {
  const { range, from, to } = req.query;
  if (range === 'custom' && typeof from === 'string' && typeof to === 'string') {
    const f = new Date(`${from}T00:00:00.000Z`);
    const t = new Date(`${to}T23:59:59.999Z`);
    if (!isNaN(f.getTime()) && !isNaN(t.getTime())) return { from: f, to: t };
  }
  const days = RANGE_DAYS[typeof range === 'string' ? range : ''] ?? 30;
  const now = new Date();
  const fromDate = new Date(now);
  fromDate.setDate(fromDate.getDate() - (days - 1));
  fromDate.setHours(0, 0, 0, 0);
  return { from: fromDate, to: now };
}

function inRange(d: Date, from: Date, to: Date): boolean {
  return d >= from && d <= to;
}

// A consolidated profit/loss view over data that's each individually real
// and already tracked elsewhere — this route only aggregates, it never
// invents a number. Revenue recognition mirrors tenant/reports.ts's own
// "collected" definition (Sale.total, immediate at checkout, + in-range
// CustomerInvoice.paymentHistory entries) rather than invoice `total`, so
// this reads as actual cash movement, not accrued/promised revenue.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'reports:view');
  if (!session) return;

  const { from, to } = resolveRange(req);
  await connectToDatabase();

  const [sales, invoices, expenses, orders, payrollRuns, returns] = await Promise.all([
    Sale.find({ clientId: session.clientId, createdAt: { $gte: from, $lte: to } }).lean() as Promise<SaleDoc[]>,
    // Not range-filtered on creation — a payment can land well after an
    // invoice was issued, so payments are filtered individually below.
    CustomerInvoice.find({ clientId: session.clientId, status: { $ne: 'Void' }, 'paymentHistory.0': { $exists: true } }).lean() as Promise<
      CustomerInvoiceDoc[]
    >,
    Expense.find({ clientId: session.clientId, date: { $gte: from, $lte: to } }).lean() as Promise<ExpenseDoc[]>,
    PurchaseOrder.find({ clientId: session.clientId, 'paymentHistory.0': { $exists: true } }).lean() as Promise<PurchaseOrderDoc[]>,
    PayrollRun.find({ clientId: session.clientId, status: { $ne: 'Draft' }, periodEnd: { $gte: from, $lte: to } }).lean() as Promise<
      PayrollRunDoc[]
    >,
    Return.find({ clientId: session.clientId, refundAmount: { $gt: 0 } }).lean() as Promise<ReturnDoc[]>,
  ]);

  const monthKey = (d: Date) => d.toISOString().slice(0, 7);
  const monthly = new Map<string, { revenue: number; expenses: number }>();
  const bump = (month: string, key: 'revenue' | 'expenses', amount: number) => {
    const m = monthly.get(month) ?? { revenue: 0, expenses: 0 };
    m[key] += amount;
    monthly.set(month, m);
  };

  let salesRevenue = 0;
  for (const sale of sales) {
    const d = (sale as unknown as { createdAt: Date }).createdAt;
    salesRevenue += sale.total;
    bump(monthKey(d), 'revenue', sale.total);
  }

  let invoicePayments = 0;
  for (const inv of invoices) {
    for (const p of inv.paymentHistory) {
      const pd = new Date(p.date);
      if (!inRange(pd, from, to)) continue;
      invoicePayments += p.amount;
      bump(monthKey(pd), 'revenue', p.amount);
    }
  }

  let customerRefunds = 0;
  let supplierCredits = 0;
  for (const ret of returns) {
    const rd = ret.refundDate ? new Date(ret.refundDate) : null;
    if (!rd || !inRange(rd, from, to)) continue;
    if (ret.direction === 'customer') {
      customerRefunds += ret.refundAmount!;
      bump(monthKey(rd), 'revenue', -ret.refundAmount!);
    } else {
      supplierCredits += ret.refundAmount!;
      bump(monthKey(rd), 'expenses', -ret.refundAmount!);
    }
  }

  const operatingExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  for (const e of expenses) bump(monthKey(new Date(e.date)), 'expenses', e.amount);

  let supplierPayments = 0;
  for (const order of orders) {
    for (const p of order.paymentHistory) {
      const pd = new Date(p.date);
      if (!inRange(pd, from, to)) continue;
      supplierPayments += p.amount;
      bump(monthKey(pd), 'expenses', p.amount);
    }
  }

  const payroll = payrollRuns.reduce((sum, r) => sum + r.totalAmount, 0);
  for (const r of payrollRuns) bump(monthKey(new Date(r.periodEnd)), 'expenses', r.totalAmount);

  const expenseByCategoryMap = new Map<string, number>();
  for (const e of expenses) expenseByCategoryMap.set(e.category, (expenseByCategoryMap.get(e.category) ?? 0) + e.amount);

  const round2 = (n: number) => Math.round(n * 100) / 100;

  const revenueTotal = round2(salesRevenue + invoicePayments - customerRefunds);
  const expensesTotal = round2(operatingExpenses + supplierPayments - supplierCredits + payroll);
  const netProfit = round2(revenueTotal - expensesTotal);

  return res.status(200).json({
    range: { from, to },
    revenue: {
      sales: round2(salesRevenue),
      invoicePayments: round2(invoicePayments),
      customerRefunds: round2(customerRefunds),
      total: revenueTotal,
    },
    expenses: {
      operatingExpenses: round2(operatingExpenses),
      supplierPayments: round2(supplierPayments),
      supplierCredits: round2(supplierCredits),
      payroll: round2(payroll),
      total: expensesTotal,
    },
    netProfit,
    marginPct: revenueTotal > 0 ? Math.round((netProfit / revenueTotal) * 100) : null,
    monthlyTrend: Array.from(monthly.entries())
      .map(([month, v]) => ({ month, revenue: round2(v.revenue), expenses: round2(v.expenses), net: round2(v.revenue - v.expenses) }))
      .sort((a, b) => a.month.localeCompare(b.month)),
    expenseByCategory: Array.from(expenseByCategoryMap.entries())
      .map(([category, amount]) => ({ category, amount: round2(amount) }))
      .sort((a, b) => b.amount - a.amount),
  });
}

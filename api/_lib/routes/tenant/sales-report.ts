import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Sale, SaleDoc } from '../../models/Sale.js';
import { CustomerInvoice, CustomerInvoiceDoc } from '../../models/CustomerInvoice.js';
import { requireTenantPermission } from '../../auth.js';
import { resolveReportRange } from '../../reportRange.js';

function inRange(d: Date, from: Date, to: Date): boolean {
  return d >= from && d <= to;
}
const round2 = (n: number) => Math.round(n * 100) / 100;

// Sales Module Phase 13 — Sales Summary/Detail, combined into one report
// with a `view` toggle rather than two near-identical routes. Revenue
// recognition mirrors financial-overview.ts's exact "collected" definition:
// Sale.total (POS checkout AND every fulfilled Sales Order — fulfill.ts
// creates a Sale record for those too, so Sale is already the single
// unified realized-sale ledger, not just POS) + CustomerInvoice.
// paymentHistory entries actually collected in range (not invoice `total`,
// which would count unpaid/accrued revenue as if it were cash). A
// SalesOrder is deliberately NOT summed on its own here — doing so would
// double-count the same revenue a moment it's fulfilled into a Sale.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'reports:view');
  if (!session) return;

  const { from, to } = resolveReportRange(req);
  const view = req.query.view === 'detail' ? 'detail' : 'summary';
  await connectToDatabase();

  const [sales, invoices] = await Promise.all([
    Sale.find({ clientId: session.clientId, createdAt: { $gte: from, $lte: to } }).sort({ createdAt: -1 }).lean() as Promise<SaleDoc[]>,
    CustomerInvoice.find({ clientId: session.clientId, status: { $ne: 'Void' }, 'paymentHistory.0': { $exists: true } }).lean() as Promise<
      CustomerInvoiceDoc[]
    >,
  ]);

  const dailyMap = new Map<string, { salesRevenue: number; invoicePayments: number; transactions: number }>();
  const bump = (day: string, key: 'salesRevenue' | 'invoicePayments' | 'transactions', amount: number) => {
    const d = dailyMap.get(day) ?? { salesRevenue: 0, invoicePayments: 0, transactions: 0 };
    d[key] += amount;
    dailyMap.set(day, d);
  };

  let totalSalesRevenue = 0;
  for (const sale of sales) {
    const d = (sale as unknown as { createdAt: Date }).createdAt;
    const day = d.toISOString().slice(0, 10);
    totalSalesRevenue += sale.total;
    bump(day, 'salesRevenue', sale.total);
    bump(day, 'transactions', 1);
  }

  let invoicePaymentsCollected = 0;
  const invoicePaymentRows: { invoiceId: string; invoiceNumber: string; date: Date; amount: number; method: string }[] = [];
  for (const inv of invoices) {
    for (const p of inv.paymentHistory) {
      const pd = new Date(p.date);
      if (!inRange(pd, from, to)) continue;
      invoicePaymentsCollected += p.amount;
      bump(pd.toISOString().slice(0, 10), 'invoicePayments', p.amount);
      invoicePaymentRows.push({ invoiceId: inv._id.toString(), invoiceNumber: inv.invoiceNumber, date: pd, amount: p.amount, method: p.method });
    }
  }

  const totalTransactions = sales.length;
  const summary = {
    totalSalesRevenue: round2(totalSalesRevenue),
    totalTransactions,
    avgTransactionValue: totalTransactions > 0 ? round2(totalSalesRevenue / totalTransactions) : 0,
    invoicePaymentsCollected: round2(invoicePaymentsCollected),
    combinedRevenue: round2(totalSalesRevenue + invoicePaymentsCollected),
  };

  const dailyTrend = Array.from(dailyMap.entries())
    .map(([date, v]) => ({ date, salesRevenue: round2(v.salesRevenue), invoicePayments: round2(v.invoicePayments), transactions: v.transactions }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (view === 'summary') {
    return res.status(200).json({ range: { from, to }, view, summary, rows: dailyTrend });
  }

  // detail — every individual Sale transaction plus every individual
  // invoice payment in range, newest first, so a reader can trace the
  // summary numbers back to real transactions.
  const detailRows = [
    ...sales.map((s) => ({
      type: 'Sale' as const,
      reference: s._id.toString().slice(-8).toUpperCase(),
      date: (s as unknown as { createdAt: Date }).createdAt,
      amount: s.total,
      method: s.paymentMethod,
      itemCount: s.items.length,
    })),
    ...invoicePaymentRows.map((p) => ({
      type: 'Invoice Payment' as const,
      reference: p.invoiceNumber,
      date: p.date,
      amount: p.amount,
      method: p.method,
      itemCount: undefined,
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  return res.status(200).json({ range: { from, to }, view, summary, rows: detailRows });
}

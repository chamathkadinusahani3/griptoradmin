import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Sale, SaleDoc } from '../../models/Sale.js';
import { CustomerInvoice, CustomerInvoiceDoc } from '../../models/CustomerInvoice.js';
import { SalesOrder, SalesOrderDoc } from '../../models/SalesOrder.js';
import { Part, PartDoc } from '../../models/Part.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { Return, ReturnDoc } from '../../models/Return.js';
import { requireTenantPermission } from '../../auth.js';
import { resolveReportRange } from '../../reportRange.js';

const round2 = (n: number) => Math.round(n * 100) / 100;

function inRange(d: Date, from: Date, to: Date): boolean {
  return d >= from && d <= to;
}

/**
 * Same "Sale + collected CustomerInvoice payments" revenue definition
 * sales-report.ts established — kept as its own small computation here
 * (not imported from that route) rather than sharing a helper across three
 * different windows (today/month/range) that each need it once, mirroring
 * sf-dashboard.ts's own precedent of writing dashboard-local aggregation
 * against the same underlying models rather than calling into a report
 * route's handler.
 */
function summarizeSales(sales: SaleDoc[], invoices: CustomerInvoiceDoc[], from: Date, to: Date) {
  let salesRevenue = 0;
  for (const s of sales) salesRevenue += s.total;
  let invoicePayments = 0;
  for (const inv of invoices) {
    for (const p of inv.paymentHistory) {
      if (inRange(new Date(p.date), from, to)) invoicePayments += p.amount;
    }
  }
  return {
    salesRevenue: round2(salesRevenue),
    transactions: sales.length,
    invoicePayments: round2(invoicePayments),
    combinedRevenue: round2(salesRevenue + invoicePayments),
  };
}

// Sales Module Phase 14 — a dedicated Sales dashboard, distinct from the
// general TenantDashboard (garage-wide operational snapshot) and the
// unrelated SalesForceDashboard (field-sales/visits/collections rollup).
// Gated by 'reports:view' like every other aggregate screen in this
// roadmap (Phase 13's reports, sf-dashboard.ts) rather than a new
// permission. Every figure here is derived on read from the same documents
// and the same filters Phase 13's reports already established — this adds
// no new source of truth, only a rollup view.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'reports:view');
  if (!session) return;

  const clientId = session.clientId;
  const { from, to } = resolveReportRange(req);
  await connectToDatabase();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const earliestBound = [todayStart, monthStart, from].reduce((min, d) => (d < min ? d : min));
  const latestBound = [todayEnd, to].reduce((max, d) => (d > max ? d : max));

  const [allSalesInWindow, invoicesWithPayments, invoicesOutstanding, invoicesInRangeForAttribution, ordersInRange, returnsInRange] = await Promise.all([
    Sale.find({ clientId, createdAt: { $gte: earliestBound, $lte: latestBound } }).lean() as Promise<SaleDoc[]>,
    // "Collected" revenue (today/month figures) — needs invoices that have
    // at least one payment; individual payments are then date-filtered
    // below.
    CustomerInvoice.find({ clientId, status: { $ne: 'Void' }, 'paymentHistory.0': { $exists: true } }).lean() as Promise<CustomerInvoiceDoc[]>,
    CustomerInvoice.find({ clientId, status: { $ne: 'Void' }, balance: { $gt: 0 } }).select('balance').lean() as Promise<CustomerInvoiceDoc[]>,
    // "Attributed" revenue (topCustomers) — the exact same set
    // top-customers-report.ts/sales-by-report.ts's customer dimension use:
    // every non-Void invoice by createdAt, using its `total`, regardless of
    // whether it's been paid yet. Deliberately a DIFFERENT invoice set from
    // invoicesWithPayments above — reusing that one here would silently
    // drop an unpaid invoice's customer out of this ranking even though
    // Phase 13's own Top Customers report would still count it.
    CustomerInvoice.find({ clientId, status: { $ne: 'Void' }, createdAt: { $gte: from, $lte: to } }).lean() as Promise<CustomerInvoiceDoc[]>,
    SalesOrder.find({ clientId, status: { $nin: ['Cancelled', 'Pending Approval'] }, createdAt: { $gte: from, $lte: to } }).lean() as Promise<
      SalesOrderDoc[]
    >,
    Return.find({ clientId, direction: 'customer', createdAt: { $gte: from, $lte: to } }).lean() as Promise<ReturnDoc[]>,
  ]);

  const salesToday = allSalesInWindow.filter((s) => inRange((s as unknown as { createdAt: Date }).createdAt, todayStart, todayEnd));
  const salesThisMonth = allSalesInWindow.filter((s) => inRange((s as unknown as { createdAt: Date }).createdAt, monthStart, todayEnd));
  const salesInRange = allSalesInWindow.filter((s) => inRange((s as unknown as { createdAt: Date }).createdAt, from, to));

  const today = summarizeSales(salesToday, invoicesWithPayments, todayStart, todayEnd);
  const thisMonth = summarizeSales(salesThisMonth, invoicesWithPayments, monthStart, todayEnd);

  const totalOutstanding = round2(invoicesOutstanding.reduce((sum, inv) => sum + inv.balance, 0));

  const totalReturns = returnsInRange.length;
  const totalReturnAmount = round2(returnsInRange.reduce((sum, r) => sum + r.totalAmount, 0));
  const totalRefunded = round2(returnsInRange.reduce((sum, r) => sum + (r.refundStatus === 'Paid' ? r.refundAmount ?? 0 : 0), 0));

  // Gross profit — product dimension, same current-cost approximation
  // gross-profit-report.ts documents (Sale's line shape has no per-line
  // cost snapshot).
  const partIds = [...new Set(salesInRange.flatMap((s) => s.items.map((i) => i.partId.toString())))];
  const parts = partIds.length ? ((await Part.find({ _id: { $in: partIds }, clientId }).select('name cost').lean()) as PartDoc[]) : [];
  const costById = new Map(parts.map((p) => [p._id.toString(), p.cost ?? 0]));
  const nameById = new Map(parts.map((p) => [p._id.toString(), p.name]));

  const productTotals = new Map<string, { revenue: number; cogs: number }>();
  for (const sale of salesInRange) {
    for (const line of sale.items) {
      const key = line.partId.toString();
      const agg = productTotals.get(key) ?? { revenue: 0, cogs: 0 };
      agg.revenue += line.price * line.qty;
      agg.cogs += (costById.get(key) ?? 0) * line.qty;
      productTotals.set(key, agg);
    }
  }
  const grossProfitTotalRevenue = round2([...productTotals.values()].reduce((sum, v) => sum + v.revenue, 0));
  const grossProfitTotalCogs = round2([...productTotals.values()].reduce((sum, v) => sum + v.cogs, 0));
  const grossProfitTotal = round2(grossProfitTotalRevenue - grossProfitTotalCogs);

  const topProducts = [...productTotals.entries()]
    .map(([id, v]) => ({ id, name: nameById.get(id) ?? 'Unknown', revenue: round2(v.revenue), grossProfit: round2(v.revenue - v.cogs) }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  // Top customers — SalesOrder + CustomerInvoice attribution, same
  // exclusion of POS Sale (no customer identity) as top-customers-report.ts.
  // Deliberately uses invoicesInRangeForAttribution (every non-Void
  // invoice), NOT the payment-based set below — see that query's own
  // comment for why they must stay separate.
  const customerTotals = new Map<string, number>();
  for (const doc of [...ordersInRange, ...invoicesInRangeForAttribution]) {
    const id = doc.customerId?.toString();
    if (!id) continue;
    customerTotals.set(id, (customerTotals.get(id) ?? 0) + doc.total);
  }
  const customerIds = [...customerTotals.keys()];
  const customers = customerIds.length ? ((await Customer.find({ _id: { $in: customerIds }, clientId }).select('name').lean()) as CustomerDoc[]) : [];
  const customerNameById = new Map(customers.map((c) => [c._id.toString(), c.name]));
  const topCustomers = [...customerTotals.entries()]
    .map(([id, revenue]) => ({ id, name: customerNameById.get(id) ?? 'Unknown', revenue: round2(revenue) }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  // Daily trend for the selected range — same shape as sales-report.ts's
  // summary view. Uses the payment-based invoice set (not the attribution
  // one above) since this trend is cash-collected, not invoiced-total.
  const invoicesInRange = invoicesWithPayments.filter((inv) => inRange((inv as unknown as { createdAt: Date }).createdAt, from, to));
  const dailyMap = new Map<string, { salesRevenue: number; invoicePayments: number }>();
  const bump = (day: string, key: 'salesRevenue' | 'invoicePayments', amount: number) => {
    const d = dailyMap.get(day) ?? { salesRevenue: 0, invoicePayments: 0 };
    d[key] += amount;
    dailyMap.set(day, d);
  };
  for (const s of salesInRange) bump((s as unknown as { createdAt: Date }).createdAt.toISOString().slice(0, 10), 'salesRevenue', s.total);
  for (const inv of invoicesInRange) {
    for (const p of inv.paymentHistory) {
      const pd = new Date(p.date);
      if (inRange(pd, from, to)) bump(pd.toISOString().slice(0, 10), 'invoicePayments', p.amount);
    }
  }
  const dailyTrend = [...dailyMap.entries()]
    .map(([date, v]) => ({ date, salesRevenue: round2(v.salesRevenue), invoicePayments: round2(v.invoicePayments) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return res.status(200).json({
    range: { from, to },
    today,
    thisMonth,
    outstanding: { totalOutstanding },
    returns: { totalReturns, totalAmount: totalReturnAmount, totalRefunded },
    grossProfit: {
      totalRevenue: grossProfitTotalRevenue,
      totalCogs: grossProfitTotalCogs,
      totalGrossProfit: grossProfitTotal,
      overallMarginPct: grossProfitTotalRevenue > 0 ? Math.round((grossProfitTotal / grossProfitTotalRevenue) * 10000) / 100 : null,
    },
    dailyTrend,
    topProducts,
    topCustomers,
  });
}

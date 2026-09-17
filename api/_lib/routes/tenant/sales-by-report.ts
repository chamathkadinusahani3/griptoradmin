import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Sale, SaleDoc } from '../../models/Sale.js';
import { SalesOrder, SalesOrderDoc } from '../../models/SalesOrder.js';
import { CustomerInvoice, CustomerInvoiceDoc } from '../../models/CustomerInvoice.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { Salesperson, SalespersonDoc } from '../../models/Salesperson.js';
import { Branch, BranchDoc } from '../../models/Branch.js';
import { requireTenantPermission } from '../../auth.js';
import { resolveReportRange } from '../../reportRange.js';

const DIMENSIONS = ['customer', 'branch', 'salesperson', 'paymentMethod'] as const;
type Dimension = (typeof DIMENSIONS)[number];
const round2 = (n: number) => Math.round(n * 100) / 100;

function inRange(d: Date, from: Date, to: Date): boolean {
  return d >= from && d <= to;
}

// Sales Module Phase 13 — one report, four groupings, rather than four
// near-identical route files (Sales by Product/Category already exists at
// inventory-report.ts and isn't repeated here).
//
// customer/salesperson: SalesOrder + CustomerInvoice, the exact same
// attribution and status filters salesActuals.ts's computeActualSales()
// already established (non-Cancelled/non-Pending-Approval orders,
// non-Void invoices) — Sale (POS) is excluded because a POS Sale has no
// customer or salesperson identity at all (see Sale.ts's own comment).
//
// branch: Sale + SalesOrder, both of which carry branchId — CustomerInvoice
// has no branchId field and is excluded.
//
// paymentMethod: Sale.paymentMethod (one per transaction) + CustomerInvoice.
// paymentHistory[].method (one per payment, date-filtered individually,
// same reasoning as sales-report.ts) combined into one map.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'reports:view');
  if (!session) return;

  const dimension = (typeof req.query.dimension === 'string' ? req.query.dimension : 'customer') as Dimension;
  if (!DIMENSIONS.includes(dimension)) {
    return res.status(400).json({ error: `dimension must be one of: ${DIMENSIONS.join(', ')}` });
  }

  const { from, to } = resolveReportRange(req);
  const clientId = session.clientId;
  await connectToDatabase();

  if (dimension === 'customer' || dimension === 'salesperson') {
    const [orders, invoices] = await Promise.all([
      SalesOrder.find({ clientId, status: { $nin: ['Cancelled', 'Pending Approval'] }, createdAt: { $gte: from, $lte: to } }).lean() as Promise<
        SalesOrderDoc[]
      >,
      CustomerInvoice.find({ clientId, status: { $ne: 'Void' }, createdAt: { $gte: from, $lte: to } }).lean() as Promise<CustomerInvoiceDoc[]>,
    ]);

    const field = dimension === 'customer' ? 'customerId' : 'salespersonId';
    const totalsById = new Map<string, { revenue: number; docCount: number }>();
    for (const doc of [...orders, ...invoices]) {
      const id = (doc as unknown as Record<string, { toString(): string } | undefined>)[field]?.toString();
      if (!id) continue;
      const agg = totalsById.get(id) ?? { revenue: 0, docCount: 0 };
      agg.revenue += doc.total;
      agg.docCount += 1;
      totalsById.set(id, agg);
    }

    const ids = [...totalsById.keys()];
    const nameById = new Map<string, string>();
    if (dimension === 'customer') {
      const customers = ids.length ? ((await Customer.find({ _id: { $in: ids }, clientId }).select('name').lean()) as CustomerDoc[]) : [];
      for (const c of customers) nameById.set(c._id.toString(), c.name);
    } else {
      const salespersons = ids.length ? ((await Salesperson.find({ _id: { $in: ids }, clientId }).select('name').lean()) as SalespersonDoc[]) : [];
      for (const s of salespersons) nameById.set(s._id.toString(), s.name);
    }

    const rows = [...totalsById.entries()]
      .map(([id, v]) => ({ id, name: nameById.get(id) ?? 'Unknown', revenue: round2(v.revenue), docCount: v.docCount }))
      .sort((a, b) => b.revenue - a.revenue);

    const totalRevenue = round2(rows.reduce((sum, r) => sum + r.revenue, 0));
    return res.status(200).json({
      range: { from, to },
      dimension,
      summary: { totalRevenue, groupCount: rows.length },
      rows,
    });
  }

  if (dimension === 'branch') {
    const [sales, orders, branches] = await Promise.all([
      Sale.find({ clientId, createdAt: { $gte: from, $lte: to } }).lean() as Promise<SaleDoc[]>,
      SalesOrder.find({ clientId, status: { $nin: ['Cancelled', 'Pending Approval'] }, createdAt: { $gte: from, $lte: to } }).lean() as Promise<
        SalesOrderDoc[]
      >,
      Branch.find({ clientId }).select('name').lean() as Promise<BranchDoc[]>,
    ]);
    const nameById = new Map(branches.map((b) => [b._id.toString(), b.name]));

    const totalsById = new Map<string, { revenue: number; docCount: number }>();
    for (const doc of [...sales, ...orders]) {
      const id = doc.branchId?.toString() ?? 'unassigned';
      const agg = totalsById.get(id) ?? { revenue: 0, docCount: 0 };
      agg.revenue += doc.total;
      agg.docCount += 1;
      totalsById.set(id, agg);
    }

    const rows = [...totalsById.entries()]
      .map(([id, v]) => ({ id, name: id === 'unassigned' ? 'Unassigned' : nameById.get(id) ?? 'Unknown branch', revenue: round2(v.revenue), docCount: v.docCount }))
      .sort((a, b) => b.revenue - a.revenue);

    const totalRevenue = round2(rows.reduce((sum, r) => sum + r.revenue, 0));
    return res.status(200).json({
      range: { from, to },
      dimension,
      summary: { totalRevenue, groupCount: rows.length },
      rows,
    });
  }

  // paymentMethod
  const [sales, invoices] = await Promise.all([
    Sale.find({ clientId, createdAt: { $gte: from, $lte: to } }).lean() as Promise<SaleDoc[]>,
    CustomerInvoice.find({ clientId, status: { $ne: 'Void' }, 'paymentHistory.0': { $exists: true } }).lean() as Promise<CustomerInvoiceDoc[]>,
  ]);

  const totalsByMethod = new Map<string, { revenue: number; docCount: number }>();
  const bumpMethod = (method: string, amount: number) => {
    const agg = totalsByMethod.get(method) ?? { revenue: 0, docCount: 0 };
    agg.revenue += amount;
    agg.docCount += 1;
    totalsByMethod.set(method, agg);
  };
  for (const s of sales) bumpMethod(s.paymentMethod, s.total);
  for (const inv of invoices) {
    for (const p of inv.paymentHistory) {
      if (!inRange(new Date(p.date), from, to)) continue;
      bumpMethod(p.method, p.amount);
    }
  }

  const rows = [...totalsByMethod.entries()]
    .map(([id, v]) => ({ id, name: id, revenue: round2(v.revenue), docCount: v.docCount }))
    .sort((a, b) => b.revenue - a.revenue);

  const totalRevenue = round2(rows.reduce((sum, r) => sum + r.revenue, 0));
  return res.status(200).json({
    range: { from, to },
    dimension,
    summary: { totalRevenue, groupCount: rows.length },
    rows,
  });
}

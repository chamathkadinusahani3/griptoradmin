import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { SalesOrder, SalesOrderDoc } from '../../models/SalesOrder.js';
import { CustomerInvoice, CustomerInvoiceDoc } from '../../models/CustomerInvoice.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { requireTenantPermission } from '../../auth.js';
import { resolveReportRange } from '../../reportRange.js';

const round2 = (n: number) => Math.round(n * 100) / 100;
const DEFAULT_LIMIT = 20;

// Sales Module Phase 13 — same attribution as sales-by-report.ts's customer
// dimension (SalesOrder + CustomerInvoice, computeActualSales.ts's exact
// status filters; POS Sale excluded — no customer identity), presented as a
// ranked top-N with customer type and average order value rather than a
// full breakdown table.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'reports:view');
  if (!session) return;

  const { from, to } = resolveReportRange(req);
  const limitParam = Number(req.query.limit);
  const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : DEFAULT_LIMIT;
  const clientId = session.clientId;
  await connectToDatabase();

  const [orders, invoices] = await Promise.all([
    SalesOrder.find({ clientId, status: { $nin: ['Cancelled', 'Pending Approval'] }, createdAt: { $gte: from, $lte: to } }).lean() as Promise<
      SalesOrderDoc[]
    >,
    CustomerInvoice.find({ clientId, status: { $ne: 'Void' }, createdAt: { $gte: from, $lte: to } }).lean() as Promise<CustomerInvoiceDoc[]>,
  ]);

  const totalsById = new Map<string, { revenue: number; docCount: number }>();
  for (const doc of [...orders, ...invoices]) {
    const id = doc.customerId?.toString();
    if (!id) continue;
    const agg = totalsById.get(id) ?? { revenue: 0, docCount: 0 };
    agg.revenue += doc.total;
    agg.docCount += 1;
    totalsById.set(id, agg);
  }

  const ids = [...totalsById.keys()];
  const customers = ids.length ? ((await Customer.find({ _id: { $in: ids }, clientId }).select('name type').lean()) as CustomerDoc[]) : [];
  const customerById = new Map(customers.map((c) => [c._id.toString(), c]));

  const rows = [...totalsById.entries()]
    .map(([id, v]) => ({
      id,
      name: customerById.get(id)?.name ?? 'Unknown',
      type: customerById.get(id)?.type ?? 'individual',
      revenue: round2(v.revenue),
      docCount: v.docCount,
      avgOrderValue: v.docCount > 0 ? round2(v.revenue / v.docCount) : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit)
    .map((r, i) => ({ rank: i + 1, ...r }));

  const totalRevenue = round2([...totalsById.values()].reduce((sum, v) => sum + v.revenue, 0));

  return res.status(200).json({
    range: { from, to },
    summary: { totalRevenue, totalCustomers: totalsById.size, shown: rows.length },
    rows,
  });
}

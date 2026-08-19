import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { PurchaseOrder, PurchaseOrderDoc } from '../../models/PurchaseOrder.js';
import { Supplier, SupplierDoc } from '../../models/Supplier.js';
import { requireTenantPermission } from '../../auth.js';
import { resolveReportRange } from '../../reportRange.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'reports:view');
  if (!session) return;

  const { from, to } = resolveReportRange(req);
  await connectToDatabase();

  const [suppliers, ordersInRange, allOrders] = await Promise.all([
    Supplier.find({ clientId: session.clientId }).lean() as Promise<SupplierDoc[]>,
    PurchaseOrder.find({ clientId: session.clientId, createdAt: { $gte: from, $lte: to } }).lean() as Promise<PurchaseOrderDoc[]>,
    // Outstanding balance and on-time rate are current-state facts, not
    // bound to the selected range — same reasoning as Supplier.openOrders
    // being derived live in suppliers/index.ts rather than range-scoped.
    PurchaseOrder.find({ clientId: session.clientId }).lean() as Promise<PurchaseOrderDoc[]>,
  ]);

  const rangeStatBySupplier = new Map<string, { spend: number; orderCount: number }>();
  for (const order of ordersInRange) {
    if (order.status !== 'Ordered' && order.status !== 'Partially Received' && order.status !== 'Received') continue;
    const key = order.supplierId.toString();
    const stat = rangeStatBySupplier.get(key) ?? { spend: 0, orderCount: 0 };
    stat.spend += order.total;
    stat.orderCount += 1;
    rangeStatBySupplier.set(key, stat);
  }

  const currentStatBySupplier = new Map<string, { outstanding: number; lastOrder: Date | null; onTimeCount: number; onTimeEligible: number }>();
  for (const order of allOrders) {
    const key = order.supplierId.toString();
    const stat = currentStatBySupplier.get(key) ?? { outstanding: 0, lastOrder: null, onTimeCount: 0, onTimeEligible: 0 };
    if (order.status === 'Ordered' || order.status === 'Partially Received' || order.status === 'Received') stat.outstanding += order.balance ?? order.total;
    if (order.status === 'Received' && order.receivedAt) {
      if (!stat.lastOrder || order.receivedAt > stat.lastOrder) stat.lastOrder = order.receivedAt;
      if (order.expectedDate) {
        stat.onTimeEligible += 1;
        if (order.receivedAt <= order.expectedDate) stat.onTimeCount += 1;
      }
    }
    currentStatBySupplier.set(key, stat);
  }

  const rows = suppliers.map((s) => {
    const key = s._id.toString();
    const rangeStat = rangeStatBySupplier.get(key);
    const currentStat = currentStatBySupplier.get(key);
    return {
      id: key,
      name: s.name,
      spendInRange: Math.round((rangeStat?.spend ?? 0) * 100) / 100,
      orderCountInRange: rangeStat?.orderCount ?? 0,
      outstanding: Math.round((currentStat?.outstanding ?? 0) * 100) / 100,
      onTime: currentStat && currentStat.onTimeEligible > 0 ? Math.round((currentStat.onTimeCount / currentStat.onTimeEligible) * 100) : null,
      lastOrder: currentStat?.lastOrder ?? null,
    };
  }).sort((a, b) => b.spendInRange - a.spendInRange);

  const totalOutstanding = rows.reduce((sum, r) => sum + r.outstanding, 0);
  const totalSpendInRange = rows.reduce((sum, r) => sum + r.spendInRange, 0);

  return res.status(200).json({
    range: { from, to },
    summary: {
      totalSuppliers: suppliers.length,
      totalOutstanding: Math.round(totalOutstanding * 100) / 100,
      totalSpendInRange: Math.round(totalSpendInRange * 100) / 100,
    },
    suppliers: rows,
  });
}

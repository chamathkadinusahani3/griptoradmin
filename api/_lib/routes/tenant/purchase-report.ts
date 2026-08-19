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

  const [orders, suppliers] = await Promise.all([
    PurchaseOrder.find({ clientId: session.clientId, createdAt: { $gte: from, $lte: to } }).lean() as Promise<PurchaseOrderDoc[]>,
    Supplier.find({ clientId: session.clientId }).select('name').lean() as Promise<SupplierDoc[]>,
  ]);
  const supplierNameById = new Map(suppliers.map((s) => [s._id.toString(), s.name]));

  const byStatus = { Draft: 0, Ordered: 0, 'Partially Received': 0, Received: 0, Cancelled: 0 };
  let totalSpend = 0;
  let onTimeCount = 0;
  let onTimeEligible = 0;
  const dailySpend = new Map<string, number>();
  const spendBySupplier = new Map<string, { name: string; spend: number; orderCount: number }>();
  const partsAgg = new Map<string, { name: string; qty: number; spend: number }>();

  for (const order of orders) {
    byStatus[order.status] += 1;
    // Ordered/Partially Received/Received orders are all real committed
    // spend — a Draft or Cancelled PO was never actually placed, same guard
    // used for Supplier's totalOutstanding in suppliers/index.ts.
    if (order.status === 'Ordered' || order.status === 'Partially Received' || order.status === 'Received') {
      totalSpend += order.total;
      const day = (order as unknown as { createdAt: Date }).createdAt.toISOString().slice(0, 10);
      dailySpend.set(day, (dailySpend.get(day) ?? 0) + order.total);

      const supplierId = order.supplierId.toString();
      const supStat = spendBySupplier.get(supplierId) ?? { name: supplierNameById.get(supplierId) ?? 'Unknown supplier', spend: 0, orderCount: 0 };
      supStat.spend += order.total;
      supStat.orderCount += 1;
      spendBySupplier.set(supplierId, supStat);

      for (const line of order.items) {
        const key = line.partId.toString();
        const agg = partsAgg.get(key) ?? { name: line.name, qty: 0, spend: 0 };
        agg.qty += line.quantity;
        agg.spend += line.unitCost * line.quantity;
        partsAgg.set(key, agg);
      }
    }
    if (order.status === 'Received' && order.receivedAt && order.expectedDate) {
      onTimeEligible += 1;
      if (order.receivedAt <= order.expectedDate) onTimeCount += 1;
    }
  }

  const topSuppliers = Array.from(spendBySupplier.values()).sort((a, b) => b.spend - a.spend).slice(0, 10);
  const topParts = Array.from(partsAgg.values()).sort((a, b) => b.spend - a.spend).slice(0, 10);

  return res.status(200).json({
    range: { from, to },
    orders: {
      total: orders.length,
      byStatus,
      totalSpend: Math.round(totalSpend * 100) / 100,
      avgOrderValue: orders.length > 0 ? Math.round((totalSpend / (byStatus.Ordered + byStatus['Partially Received'] + byStatus.Received || 1)) * 100) / 100 : 0,
      onTimeRate: onTimeEligible > 0 ? Math.round((onTimeCount / onTimeEligible) * 100) : null,
    },
    dailySpend: Array.from(dailySpend.entries()).map(([date, amount]) => ({ date, amount })).sort((a, b) => a.date.localeCompare(b.date)),
    topSuppliers: topSuppliers.map((s) => ({ ...s, spend: Math.round(s.spend * 100) / 100 })),
    topParts: topParts.map((p) => ({ ...p, spend: Math.round(p.spend * 100) / 100 })),
  });
}

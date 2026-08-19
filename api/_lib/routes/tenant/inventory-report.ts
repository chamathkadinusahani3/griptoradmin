import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Part, PartDoc } from '../../models/Part.js';
import { Sale, SaleDoc } from '../../models/Sale.js';
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

  const [parts, sales] = await Promise.all([
    Part.find({ clientId: session.clientId }).lean() as Promise<PartDoc[]>,
    Sale.find({ clientId: session.clientId, createdAt: { $gte: from, $lte: to } }).lean() as Promise<SaleDoc[]>,
  ]);

  // --- Current inventory snapshot (not range-bound) ---
  const byCategoryMap = new Map<string, { value: number; count: number }>();
  let totalValue = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;
  for (const part of parts) {
    const value = part.stock * part.price;
    totalValue += value;
    if (part.stock === 0) outOfStockCount += 1;
    else if (part.stock <= part.reorderAt) lowStockCount += 1;
    const cat = byCategoryMap.get(part.category) ?? { value: 0, count: 0 };
    cat.value += value;
    cat.count += 1;
    byCategoryMap.set(part.category, cat);
  }
  const topItemsByValue = [...parts]
    .map((p) => ({ name: p.name, category: p.category, stock: p.stock, value: p.stock * p.price }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  // --- Sales in range ---
  const dailySales = new Map<string, number>();
  let salesRevenue = 0;
  let unitsSold = 0;
  const soldByPart = new Map<string, { name: string; qty: number; revenue: number }>();
  for (const sale of sales) {
    const day = (sale as unknown as { createdAt: Date }).createdAt.toISOString().slice(0, 10);
    dailySales.set(day, (dailySales.get(day) ?? 0) + sale.total);
    salesRevenue += sale.total;
    for (const line of sale.items) {
      unitsSold += line.qty;
      const key = line.partId.toString();
      const agg = soldByPart.get(key) ?? { name: line.name, qty: 0, revenue: 0 };
      agg.qty += line.qty;
      agg.revenue += line.price * line.qty;
      soldByPart.set(key, agg);
    }
  }
  const topSellingItems = Array.from(soldByPart.values()).sort((a, b) => b.qty - a.qty).slice(0, 10);

  return res.status(200).json({
    range: { from, to },
    totalValue: Math.round(totalValue * 100) / 100,
    totalItems: parts.length,
    lowStockCount,
    outOfStockCount,
    salesRevenue: Math.round(salesRevenue * 100) / 100,
    unitsSold,
    dailySales: Array.from(dailySales.entries()).map(([date, revenue]) => ({ date, revenue })).sort((a, b) => a.date.localeCompare(b.date)),
    byCategory: Array.from(byCategoryMap.entries()).map(([category, v]) => ({ category, ...v })).sort((a, b) => b.value - a.value),
    topItemsByValue,
    topSellingItems,
  });
}

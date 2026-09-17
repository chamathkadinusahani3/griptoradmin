import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Part, PartDoc } from '../../models/Part.js';
import { Sale, SaleDoc } from '../../models/Sale.js';
import { requireTenantPermission } from '../../auth.js';
import { resolveReportRange } from '../../reportRange.js';

// Sales Module Phase 13 — "how much of this part have we actually sold" can
// only be answered from Sale (POS checkout AND every fulfilled Sales
// Order — see sales-report.ts's comment for why that's the single unified
// realized-sale ledger). `from`/`to` bounds how much was sold IN this
// window; `lastSoldAt` is computed from the tenant's ENTIRE Sale history
// (not range-bound) so a part that sold once two years ago doesn't read as
// "never sold" just because the report window is short.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'reports:view');
  if (!session) return;

  const { from, to } = resolveReportRange(req);
  const clientId = session.clientId;
  await connectToDatabase();

  const [parts, allSales] = await Promise.all([
    Part.find({ clientId, stock: { $gt: 0 } }).lean() as Promise<PartDoc[]>,
    Sale.find({ clientId }).select('items createdAt').lean() as Promise<SaleDoc[]>,
  ]);

  const qtyInRangeByPart = new Map<string, number>();
  const lastSoldAtByPart = new Map<string, Date>();
  for (const sale of allSales) {
    const createdAt = (sale as unknown as { createdAt: Date }).createdAt;
    for (const line of sale.items) {
      const key = line.partId.toString();
      if (createdAt >= from && createdAt <= to) {
        qtyInRangeByPart.set(key, (qtyInRangeByPart.get(key) ?? 0) + line.qty);
      }
      const existing = lastSoldAtByPart.get(key);
      if (!existing || createdAt > existing) lastSoldAtByPart.set(key, createdAt);
    }
  }

  const now = Date.now();
  const rows = parts
    .map((p) => {
      const id = p._id.toString();
      const lastSoldAt = lastSoldAtByPart.get(id) ?? null;
      return {
        id,
        name: p.name,
        category: p.category,
        stock: p.stock,
        qtySoldInRange: qtyInRangeByPart.get(id) ?? 0,
        lastSoldAt,
        daysSinceLastSale: lastSoldAt ? Math.floor((now - lastSoldAt.getTime()) / (24 * 60 * 60 * 1000)) : null,
        stockValue: Math.round(p.stock * p.price * 100) / 100,
      };
    })
    // Slowest movers first: zero/lowest units sold in range, ties broken by
    // whichever has gone longest (or forever) without a sale.
    .sort((a, b) => a.qtySoldInRange - b.qtySoldInRange || (b.daysSinceLastSale ?? Infinity) - (a.daysSinceLastSale ?? Infinity));

  const neverSoldCount = rows.filter((r) => r.lastSoldAt === null).length;
  const zeroInRangeCount = rows.filter((r) => r.qtySoldInRange === 0).length;
  const totalStockValueAtRisk = Math.round(rows.filter((r) => r.qtySoldInRange === 0).reduce((sum, r) => sum + r.stockValue, 0) * 100) / 100;

  return res.status(200).json({
    range: { from, to },
    summary: { totalParts: parts.length, zeroInRangeCount, neverSoldCount, totalStockValueAtRisk },
    rows,
  });
}

import { Sale } from './models/Sale.js';
import { SalesOrder } from './models/SalesOrder.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const VELOCITY_WINDOW_DAYS = 90;

/**
 * Dealer Credit Control roadmap Module 3 — a rule-based (no AI/LLM call,
 * per the user's decision) suggested reorder quantity: how much stock is
 * needed to get back above the reorder point, plus roughly one month of
 * recent sales velocity as a buffer so the part doesn't immediately dip low
 * again. Batches every part in one pass (two queries total, not N+1) so it
 * stays cheap enough to run on every Purchase Order line-add.
 *
 * suggestedQty = max(reorderAt - stock, 0) + ceil(qtySoldLast90Days / 3)
 */
export async function getSuggestedReorderQtyByPart(
  clientId: string,
  parts: { _id: { toString(): string }; stock: number; reorderAt: number }[]
): Promise<Map<string, number>> {
  const suggestions = new Map<string, number>();
  const lowStockParts = parts.filter((p) => p.stock <= p.reorderAt);
  if (lowStockParts.length === 0) return suggestions;

  const partIds = lowStockParts.map((p) => p._id.toString());
  const since = new Date(Date.now() - VELOCITY_WINDOW_DAYS * DAY_MS);

  const qtySoldByPart = new Map<string, number>();
  const [sales, salesOrders] = await Promise.all([
    Sale.find({ clientId, createdAt: { $gte: since }, 'items.partId': { $in: partIds } })
      .select('items')
      .lean() as Promise<{ items: { partId: { toString(): string }; qty: number }[] }[]>,
    SalesOrder.find({ clientId, createdAt: { $gte: since }, status: { $ne: 'Cancelled' }, 'items.partId': { $in: partIds } })
      .select('items')
      .lean() as Promise<{ items: { partId?: { toString(): string }; quantity: number }[] }[]>,
  ]);
  for (const sale of sales) {
    for (const line of sale.items) {
      const key = line.partId.toString();
      if (!partIds.includes(key)) continue;
      qtySoldByPart.set(key, (qtySoldByPart.get(key) ?? 0) + line.qty);
    }
  }
  for (const order of salesOrders) {
    for (const line of order.items) {
      if (!line.partId) continue;
      const key = line.partId.toString();
      if (!partIds.includes(key)) continue;
      qtySoldByPart.set(key, (qtySoldByPart.get(key) ?? 0) + line.quantity);
    }
  }

  for (const part of lowStockParts) {
    const key = part._id.toString();
    const shortfall = Math.max(part.reorderAt - part.stock, 0);
    const monthlyVelocityBuffer = Math.ceil((qtySoldByPart.get(key) ?? 0) / 3);
    suggestions.set(key, shortfall + monthlyVelocityBuffer);
  }
  return suggestions;
}

import { Promotion, PromotionDoc } from './models/Promotion.js';

export interface PromotionMatch {
  promotionId: string;
  promotionName: string;
  discountType: 'percent' | 'amount';
  discountValue: number;
}

export interface PromotionContext {
  /** Undefined for POS checkout — Sale has no customer identity at all, so a promotion scoped to specific customerTypes never matches there. */
  customerType?: string;
  branchId?: string;
  /** The whole document's raw (pre-discount) subtotal — checked against each candidate promotion's minOrderValue. */
  orderSubtotal: number;
}

/** Active promotions whose date window covers `now` — fetched once per request, same "one lookup, resolve every line in-memory" shape as priceListResolver.ts. */
export async function getActivePromotions(clientId: string, now: Date = new Date()): Promise<PromotionDoc[]> {
  return Promotion.find({ clientId, active: true, startDate: { $lte: now }, endDate: { $gte: now } }).lean();
}

function promotionApplies(promo: PromotionDoc, ctx: PromotionContext, partId: string, quantity: number): boolean {
  if (promo.partIds.length > 0 && !promo.partIds.some((id) => id.toString() === partId)) return false;
  if (promo.branchIds.length > 0 && (!ctx.branchId || !promo.branchIds.some((id) => id.toString() === ctx.branchId))) return false;
  if (promo.customerTypes.length > 0 && (!ctx.customerType || !(promo.customerTypes as string[]).includes(ctx.customerType))) return false;
  if (promo.minQty > 0 && quantity < promo.minQty) return false;
  if (promo.minOrderValue > 0 && ctx.orderSubtotal < promo.minOrderValue) return false;
  return true;
}

/** Among every promotion applicable to this one line, picks whichever gives the largest discount — no stacking, exactly one promotion per line. */
export function resolveBestPromotion(
  promotions: PromotionDoc[],
  ctx: PromotionContext,
  partId: string,
  quantity: number,
  grossLineTotal: number
): PromotionMatch | null {
  let best: PromotionMatch | null = null;
  let bestDiscountAmount = 0;
  for (const promo of promotions) {
    if (!promotionApplies(promo, ctx, partId, quantity)) continue;
    const discountAmount = promo.discountType === 'percent' ? (grossLineTotal * promo.discountValue) / 100 : Math.min(promo.discountValue, grossLineTotal);
    if (discountAmount > bestDiscountAmount) {
      bestDiscountAmount = discountAmount;
      best = { promotionId: promo._id.toString(), promotionName: promo.name, discountType: promo.discountType, discountValue: promo.discountValue };
    }
  }
  return best;
}

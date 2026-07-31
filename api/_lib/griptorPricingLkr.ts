/**
 * Griptor's own subscription pricing in LKR — used ONLY for real PayHere
 * charges of a tenant's Starter/Professional plan. Deliberately separate
 * from api/_lib/pricingCatalog.ts (USD, src/data/modules.ts's PRICING_TIERS)
 * — different currency, different purpose. Does NOT touch formatCurrency,
 * MODULES, or any garage-internal price display (job costs, POS, a
 * garage's own CustomerInvoice totals) — that's a completely separate,
 * tenant-owned currency concern, not Griptor's own billing.
 *
 * Approximate round figures (~300 LKR/USD), not a precise FX conversion —
 * adjust these two numbers directly if the real list price should differ.
 */
export const PLAN_PRICE_LKR: Record<'Starter' | 'Professional', number> = {
  Starter: 30000,
  Professional: 75000,
};

export function getPlanPriceLkr(plan: 'Starter' | 'Professional'): number {
  return PLAN_PRICE_LKR[plan];
}

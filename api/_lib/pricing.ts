import { PricingTier, PricingTierDoc } from './models/PricingTier.js';

/** Trial clients are always $0; otherwise use the plan's real, DB-backed list price (a Custom-priced plan has price: null, so falls back). */
export async function computeMrr(plan: string, status: string, fallback = 0): Promise<number> {
  if (status === 'Trial') return 0;
  const tier = (await PricingTier.findOne({ name: plan }).lean()) as PricingTierDoc | null;
  return tier?.price ?? fallback;
}

/** Plans are no longer a fixed enum — any admin-created PricingTier name is valid. Checked at every write boundary that accepts a plan name. */
export async function isValidPlanName(plan: string): Promise<boolean> {
  return !!(await PricingTier.exists({ name: plan }));
}

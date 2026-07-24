import { PRICING_TIERS } from './pricingCatalog';

/** Trial clients are always $0; otherwise use the plan's list price (Enterprise is custom-priced, so falls back). */
export function computeMrr(plan: string, status: string, fallback = 0): number {
  if (status === 'Trial') return 0;
  const tier = PRICING_TIERS.find((t) => t.name === plan);
  return tier?.price ?? fallback;
}

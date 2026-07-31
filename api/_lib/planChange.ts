import { ClientDoc } from './models/Client.js';

// Widened from a fixed 3-name union — plans are no longer a closed set
// (api/_lib/models/PricingTier.ts), and this stub doesn't inspect the value anyway.
export type AnyPlan = string;

/**
 * Real gateway subscription sync for an actual plan change — TEMPORARILY a
 * no-op. This used to call Stripe directly; Stripe was removed (doesn't
 * support Sri Lankan merchants) in favor of PayHere, whose recurring-plan
 * sync is being rebuilt as its own phase (PayHere Phase 2, not built yet —
 * see the plan file's "What's explicitly NOT in scope for Phase 1").
 *
 * Left as a real function (not deleted) so api/clients/[id].ts's call site
 * doesn't need to change again once PayHere Phase 2 lands — only this
 * function's body does. Local plan/mrr writes (computeMrr) are unaffected
 * either way; only the actual payment-gateway sync is currently disabled.
 */
export async function applyPlanChange(_existing: ClientDoc, _newPlan: AnyPlan): Promise<Record<string, unknown>> {
  return {};
}

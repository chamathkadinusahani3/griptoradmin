export type ClientStatus = 'Active' | 'Trial' | 'Suspended';
// Widened from a fixed 3-name union — super admins can create new named
// plans from the Subscriptions page (api/_lib/models/PricingTier.ts).
export type PlanName = string;

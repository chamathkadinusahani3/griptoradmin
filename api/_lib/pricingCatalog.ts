/**
 * Self-contained copy of `src/data/modules.ts`'s PRICING_TIERS, for use by
 * api/** code only. Importing directly from `../../src/data/modules` works
 * fine under `tsx` but crashes `vercel dev`'s serverless function runtime
 * ("does not provide an export named ...") — its bundler doesn't reliably
 * resolve imports that reach out of `api/` into `src/`. Keep this in sync
 * with `src/data/modules.ts`'s PRICING_TIERS if pricing ever changes.
 */
export interface PricingTier {
  id: string;
  name: string;
  price: number | null; // null = custom
  cadence: string;
  popular?: boolean;
  description: string;
  features: string[];
}

export const PRICING_TIERS: PricingTier[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: 99,
    cadence: '/mo',
    description: 'For single-bay garages getting started.',
    features: ['1 module included', 'Up to 3 staff seats', 'Email support', 'Basic reporting', '1 location'],
  },
  {
    id: 'pro',
    name: 'Professional',
    price: 249,
    cadence: '/mo',
    popular: true,
    description: 'For growing multi-bay workshops.',
    features: [
      'All modules included',
      'Up to 15 staff seats',
      'Priority support',
      'Advanced analytics',
      'Up to 3 locations',
      'API access',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: null,
    cadence: 'Custom',
    description: 'For garage chains & franchises.',
    features: [
      'All modules + add-ons',
      'Unlimited seats',
      'Dedicated success manager',
      'Custom integrations',
      'Unlimited locations',
      'SLA & SSO',
    ],
  },
];

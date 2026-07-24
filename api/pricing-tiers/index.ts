import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../_lib/db';
import { PricingTierOverride, PricingTierOverrideDoc } from '../_lib/models/PricingTierOverride';
import { requireAuth } from '../_lib/auth';
import { PRICING_TIERS } from '../_lib/pricingCatalog';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!requireAuth(req, res, 'super')) return;

  await connectToDatabase();
  const overrides = (await PricingTierOverride.find().lean()) as PricingTierOverrideDoc[];
  const featuresById = new Map(overrides.map((o) => [o.tierId, o.features]));

  const tiers = PRICING_TIERS.map((tier) => ({
    ...tier,
    features: featuresById.get(tier.id) ?? tier.features,
  }));

  return res.status(200).json({ tiers });
}

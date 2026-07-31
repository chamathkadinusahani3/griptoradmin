import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { PricingTier, PricingTierDoc } from '../../models/PricingTier.js';
import { applyPublicCorsGet } from '../../cors.js';
import { serializePricingTier } from '../../serializers.js';

// Public, unauthenticated, cross-origin (griptorweb's Pricing section reads
// this directly) — the counterpart to the super/tenant-only GET in
// api/pricing-tiers/index.ts. Deliberately excludes hidden:true tiers, the
// one real thing that flag was built for (Subscriptions.tsx's "Hidden from
// website" toggle) — everything else about a tier (name/price/features) is
// fine to expose publicly, same as the internal endpoint's own reasoning.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyPublicCorsGet(req, res)) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  await connectToDatabase();
  const tiers = (await PricingTier.find({ hidden: { $ne: true } }).sort({ sortOrder: 1 }).lean()) as PricingTierDoc[];
  return res.status(200).json({ tiers: tiers.map(serializePricingTier) });
}

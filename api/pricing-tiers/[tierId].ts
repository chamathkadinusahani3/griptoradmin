import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../_lib/db';
import { PricingTierOverride } from '../_lib/models/PricingTierOverride';
import { requireAuth } from '../_lib/auth';
import { PRICING_TIERS } from '../_lib/pricingCatalog';

interface UpdateTierBody {
  features?: string[];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!requireAuth(req, res, 'super')) return;

  const { tierId } = req.query;
  if (typeof tierId !== 'string') return res.status(400).json({ error: 'Missing tier id' });

  const baseTier = PRICING_TIERS.find((t) => t.id === tierId);
  if (!baseTier) return res.status(404).json({ error: 'Unknown pricing tier' });

  const { features } = (req.body ?? {}) as UpdateTierBody;
  if (!features) return res.status(400).json({ error: 'features is required' });

  await connectToDatabase();
  await PricingTierOverride.findOneAndUpdate(
    { tierId },
    { tierId, features },
    { upsert: true }
  );

  return res.status(200).json({ tier: { ...baseTier, features } });
}

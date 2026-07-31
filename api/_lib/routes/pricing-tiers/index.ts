import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { PricingTier, PricingTierDoc } from '../../models/PricingTier.js';
import { requireAuth } from '../../auth.js';
import { slugify } from '../../slug.js';
import { serializePricingTier } from '../../serializers.js';

interface CreateTierBody {
  name?: string;
  price?: number | null;
  cadence?: string;
  popular?: boolean;
  description?: string;
  features?: string[];
  hidden?: boolean;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

// Any authenticated role can read the tier list — tier name/price/features
// aren't sensitive, and tenant pages (Settings.tsx's Plan card) need this
// same real tier data alongside super admin's Subscriptions/ClientDetail
// pages. Only creating/editing a tier stays super-only (handleCreate below,
// and [tierId].ts's PATCH).
async function handleList(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;

  await connectToDatabase();
  const tiers = (await PricingTier.find().sort({ sortOrder: 1 }).lean()) as PricingTierDoc[];
  return res.status(200).json({ tiers: tiers.map(serializePricingTier) });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res, 'super')) return;

  const { name, price, cadence, popular, description, features, hidden } = (req.body ?? {}) as CreateTierBody;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
  if (price != null && (typeof price !== 'number' || price < 0)) {
    return res.status(400).json({ error: 'price must be a positive number, or omitted for Custom pricing' });
  }

  await connectToDatabase();

  const existing = await PricingTier.findOne({ name: name.trim() }).lean();
  if (existing) return res.status(400).json({ error: `A plan named "${name.trim()}" already exists` });

  let tierId = slugify(name);
  let suffix = 2;
  while (await PricingTier.exists({ tierId })) {
    tierId = `${slugify(name)}-${suffix}`;
    suffix += 1;
  }

  const highest = await PricingTier.findOne().sort({ sortOrder: -1 }).lean();
  const sortOrder = ((highest as PricingTierDoc | null)?.sortOrder ?? -1) + 1;

  const tier = await PricingTier.create({
    tierId,
    name: name.trim(),
    price: price ?? undefined,
    cadence: cadence || '/mo',
    popular: !!popular,
    description: description || '',
    features: features ?? [],
    sortOrder,
    hidden: !!hidden,
  });

  return res.status(201).json({ tier: serializePricingTier(tier.toObject()) });
}

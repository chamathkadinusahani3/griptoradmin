import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { PricingTier, PricingTierDoc } from '../../models/PricingTier.js';
import { Client } from '../../models/Client.js';
import { requireAuth } from '../../auth.js';
import { serializePricingTier } from '../../serializers.js';

interface UpdateTierBody {
  name?: string;
  price?: number | null;
  cadence?: string;
  popular?: boolean;
  description?: string;
  features?: string[];
  hidden?: boolean;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'PATCH') return handlePatch(req, res);
  if (req.method === 'DELETE') return handleDelete(req, res);
  res.setHeader('Allow', 'PATCH, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handlePatch(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res, 'super')) return;

  const { tierId } = req.query;
  if (typeof tierId !== 'string') return res.status(400).json({ error: 'Missing tier id' });

  await connectToDatabase();

  const existing = (await PricingTier.findOne({ tierId }).lean()) as PricingTierDoc | null;
  if (!existing) return res.status(404).json({ error: 'Unknown pricing tier' });

  const body = (req.body ?? {}) as UpdateTierBody;
  if (body.price != null && (typeof body.price !== 'number' || body.price < 0)) {
    return res.status(400).json({ error: 'price must be a positive number, or null for Custom pricing' });
  }
  if (body.name !== undefined && !body.name.trim()) {
    return res.status(400).json({ error: 'name cannot be empty' });
  }
  if (body.name !== undefined && body.name.trim() !== existing.name) {
    const nameTaken = await PricingTier.findOne({ name: body.name.trim(), tierId: { $ne: tierId } }).lean();
    if (nameTaken) return res.status(400).json({ error: `A plan named "${body.name.trim()}" already exists` });
  }

  // Renaming a plan a client is currently assigned to would silently orphan
  // that Client.plan string (it'd no longer match any real PricingTier.name)
  // — reassign every currently-assigned client to the new name in the same
  // pass so `computeMrr`/`isValidPlanName` (api/_lib/pricing.ts) keep working
  // for them.
  if (body.name !== undefined && body.name.trim() !== existing.name) {
    await Client.updateMany({ plan: existing.name }, { plan: body.name.trim() });
  }

  const update: Record<string, unknown> = {};
  if (body.name !== undefined) update.name = body.name.trim();
  // Passed through as-is (including a real `null`) — a partial $set update
  // silently drops `undefined` keys (Mongoose strips them before hitting the
  // driver), so `null` is the only way to actually clear price back to
  // "Custom" here, unlike handleCreate's fresh-document construction where
  // omitting the key has the same effect.
  if (body.price !== undefined) update.price = body.price;
  if (body.cadence !== undefined) update.cadence = body.cadence;
  if (body.popular !== undefined) update.popular = body.popular;
  if (body.description !== undefined) update.description = body.description;
  if (body.features !== undefined) update.features = body.features;
  if (body.hidden !== undefined) update.hidden = body.hidden;

  const tier = (await PricingTier.findOneAndUpdate({ tierId }, update, { returnDocument: 'after' }).lean()) as PricingTierDoc;
  return res.status(200).json({ tier: serializePricingTier(tier) });
}

// A real footgun guard, not a soft warning: refuses to delete a plan while
// any Client is still assigned to it (Client.plan is just a validated string,
// not a foreign key Mongo could enforce for us — see api/_lib/pricing.ts's
// isValidPlanName). The admin must reassign those clients first via
// Subscriptions.tsx's existing "Assign plan" flow.
async function handleDelete(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res, 'super')) return;

  const { tierId } = req.query;
  if (typeof tierId !== 'string') return res.status(400).json({ error: 'Missing tier id' });

  await connectToDatabase();

  const existing = (await PricingTier.findOne({ tierId }).lean()) as PricingTierDoc | null;
  if (!existing) return res.status(404).json({ error: 'Unknown pricing tier' });

  const assignedCount = await Client.countDocuments({ plan: existing.name });
  if (assignedCount > 0) {
    return res.status(409).json({
      error: `${assignedCount} client${assignedCount === 1 ? ' is' : 's are'} still on the "${existing.name}" plan — reassign them to a different plan before deleting it.`,
    });
  }

  await PricingTier.deleteOne({ tierId });
  return res.status(204).end();
}

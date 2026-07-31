import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { LoyaltyReward, LoyaltyRewardDoc } from '../../models/LoyaltyReward.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeLoyaltyReward } from '../../serializers.js';

interface CreateRewardBody {
  name?: string;
  pointsCost?: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'loyalty-rewards:view');
  if (!session) return;

  await connectToDatabase();
  const rewards = (await LoyaltyReward.find({ clientId: session.clientId }).sort({ pointsCost: 1 }).lean()) as LoyaltyRewardDoc[];
  return res.status(200).json({ rewards: rewards.map(serializeLoyaltyReward) });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'loyalty-rewards:manage');
  if (!session) return;

  const { name, pointsCost } = (req.body ?? {}) as CreateRewardBody;
  if (!name || !pointsCost || pointsCost <= 0) {
    return res.status(400).json({ error: 'name and a positive pointsCost are required' });
  }

  await connectToDatabase();
  const reward = await LoyaltyReward.create({ clientId: session.clientId, name, pointsCost });

  return res.status(201).json({ reward: serializeLoyaltyReward(reward.toObject()) });
}

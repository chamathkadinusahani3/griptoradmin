import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { LoyaltyReward, LoyaltyRewardDoc } from '../../models/LoyaltyReward.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeLoyaltyReward } from '../../serializers.js';

interface UpdateRewardBody {
  name?: string;
  pointsCost?: number;
  active?: boolean;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'loyalty-rewards:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing reward id' });

  await connectToDatabase();

  const existing = await LoyaltyReward.findOne({ _id: id, clientId: session.clientId }).lean();
  if (!existing) return res.status(404).json({ error: 'Reward not found' });

  const body = (req.body ?? {}) as UpdateRewardBody;
  const update: Record<string, unknown> = {};
  for (const key of ['name', 'pointsCost', 'active'] as const) {
    if (body[key] !== undefined) update[key] = body[key];
  }

  const reward = (await LoyaltyReward.findOneAndUpdate(
    { _id: id, clientId: session.clientId },
    update,
    { returnDocument: 'after' }
  ).lean()) as LoyaltyRewardDoc;

  return res.status(200).json({ reward: serializeLoyaltyReward(reward) });
}

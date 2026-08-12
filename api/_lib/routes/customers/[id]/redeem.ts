import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../../db.js';
import { Customer, CustomerDoc } from '../../../models/Customer.js';
import { LoyaltyReward, LoyaltyRewardDoc } from '../../../models/LoyaltyReward.js';
import { LoyaltyTransaction } from '../../../models/LoyaltyTransaction.js';
import { requireTenantPermission } from '../../../auth.js';
import { hasAddOn } from '../../../entitlements.js';
import { serializeCustomer } from '../../../serializers.js';

interface RedeemBody {
  rewardId?: string;
}

// The direct fix for Anura's confirmed redemption bug: their version clamps
// an insufficient balance to zero (`Math.max(0, bal + delta)`) instead of
// rejecting. Here the balance check and the decrement happen in ONE atomic
// findOneAndUpdate — the `loyaltyPoints: {$gte: cost}` guard is part of the
// query filter itself, so a customer with insufficient points simply
// doesn't match and nothing is written; there's no read-then-write race
// where two concurrent redemptions could both "succeed" past zero.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'customers:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing customer id' });

  const { rewardId } = (req.body ?? {}) as RedeemBody;
  if (!rewardId) return res.status(400).json({ error: 'rewardId is required' });

  await connectToDatabase();

  if (!(await hasAddOn(session.clientId, 'crm-loyalty'))) {
    return res.status(400).json({ error: 'Loyalty & Rewards is not enabled for this account' });
  }

  const reward = (await LoyaltyReward.findOne({ _id: rewardId, clientId: session.clientId, active: true }).lean()) as LoyaltyRewardDoc | null;
  if (!reward) return res.status(400).json({ error: 'Unknown or inactive reward' });

  const customer = (await Customer.findOneAndUpdate(
    { _id: id, clientId: session.clientId, loyaltyPoints: { $gte: reward.pointsCost } },
    { $inc: { loyaltyPoints: -reward.pointsCost } },
    { returnDocument: 'after' }
  ).lean()) as CustomerDoc | null;

  if (!customer) {
    // Either the customer doesn't exist in this tenant, or they exist but
    // don't have enough points — distinguish just for a clearer message.
    const exists = await Customer.exists({ _id: id, clientId: session.clientId });
    if (!exists) return res.status(404).json({ error: 'Customer not found' });
    return res.status(400).json({ error: 'Not enough points for this reward' });
  }

  await LoyaltyTransaction.create({
    clientId: session.clientId,
    customerId: id,
    points: -reward.pointsCost,
    reason: `Redeemed: ${reward.name}`,
    rewardId: reward._id,
  });

  return res.status(200).json({ customer: serializeCustomer(customer) });
}

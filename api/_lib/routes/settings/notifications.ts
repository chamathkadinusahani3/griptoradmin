import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { User, UserDoc } from '../../models/User.js';
import { requireAuth } from '../../auth.js';
import { serializeUser } from '../../serializers.js';

interface UpdatePrefsBody {
  newLeads?: boolean;
  failedPayments?: boolean;
  newTickets?: boolean;
  weeklyDigest?: boolean;
  productUpdates?: boolean;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = requireAuth(req, res, 'super');
  if (!session) return;

  const body = (req.body ?? {}) as UpdatePrefsBody;

  await connectToDatabase();
  const update: Record<string, unknown> = {};
  for (const key of ['newLeads', 'failedPayments', 'newTickets', 'weeklyDigest', 'productUpdates'] as const) {
    if (body[key] !== undefined) update[`notificationPrefs.${key}`] = body[key];
  }

  const user = (await User.findByIdAndUpdate(session.sub, { $set: update }, { returnDocument: 'after' }).lean()) as UserDoc | null;
  if (!user) return res.status(404).json({ error: 'User not found' });

  return res.status(200).json({ user: serializeUser(user) });
}

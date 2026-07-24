import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../_lib/db';
import { User, UserDoc } from '../_lib/models/User';
import { requireAuth } from '../_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'DELETE') {
    res.setHeader('Allow', 'DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = requireAuth(req, res, 'super');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing team member id' });

  if (id === session.sub) {
    return res.status(403).json({ error: 'You cannot remove yourself from the team' });
  }

  await connectToDatabase();
  const member = (await User.findOne({ _id: id, role: 'super' }).lean()) as UserDoc | null;
  if (!member) return res.status(404).json({ error: 'Team member not found' });

  if (member.teamRole === 'Owner') {
    return res.status(403).json({ error: 'The Owner cannot be removed' });
  }

  await User.deleteOne({ _id: id });
  return res.status(200).json({ ok: true });
}

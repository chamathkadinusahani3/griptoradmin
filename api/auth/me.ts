import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../_lib/db';
import { User, UserDoc } from '../_lib/models/User';
import { Client, ClientDoc } from '../_lib/models/Client';
import { requireAuth } from '../_lib/auth';
import { serializeUser } from '../_lib/serializers';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = requireAuth(req, res);
  if (!session) return; // requireAuth already sent the 401

  await connectToDatabase();

  const user = (await User.findById(session.sub).lean()) as UserDoc | null;
  if (!user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const client = user.clientId
    ? ((await Client.findById(user.clientId).lean()) as ClientDoc | null)
    : null;

  return res.status(200).json({ user: serializeUser(user, client) });
}

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../_lib/db';
import { Client, ClientDoc } from '../_lib/models/Client';
import { requireTenant } from '../_lib/auth';
import { serializeClient } from '../_lib/serializers';

interface SmsConfigBody {
  userId?: string;
  apiKey?: string;
  senderId?: string;
}

// Self-service — the garage sets its own notify.lk credentials. First
// tenant-facing settings endpoint in the app; branding/other Client fields
// are still super-admin-edited (ClientDetail.tsx), unchanged by this phase.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = requireTenant(req, res);
  if (!session) return;

  const { userId, apiKey, senderId } = (req.body ?? {}) as SmsConfigBody;
  if (!userId || !apiKey) {
    return res.status(400).json({ error: 'userId and apiKey are required' });
  }

  await connectToDatabase();
  const client = (await Client.findOneAndUpdate(
    { _id: session.clientId },
    { smsConfig: { userId, apiKey, senderId } },
    { returnDocument: 'after' }
  ).lean()) as ClientDoc;

  return res.status(200).json({ client: serializeClient(client) });
}

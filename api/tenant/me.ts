import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../_lib/db';
import { Client, ClientDoc } from '../_lib/models/Client';
import { requireTenant } from '../_lib/auth';
import { serializeClient } from '../_lib/serializers';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = requireTenant(req, res);
  if (!session) return;

  await connectToDatabase();
  const client = (await Client.findById(session.clientId).lean()) as ClientDoc | null;
  if (!client) return res.status(404).json({ error: 'Garage not found' });

  return res.status(200).json({ client: serializeClient(client) });
}

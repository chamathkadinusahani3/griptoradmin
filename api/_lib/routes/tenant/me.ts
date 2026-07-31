import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Client, ClientDoc } from '../../models/Client.js';
import { requireTenant } from '../../auth.js';
import { serializeClient } from '../../serializers.js';

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

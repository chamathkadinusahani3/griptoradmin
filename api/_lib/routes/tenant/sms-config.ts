import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Client, ClientDoc } from '../../models/Client.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeClient } from '../../serializers.js';

interface SmsConfigBody {
  userId?: string;
  apiKey?: string;
  senderId?: string;
  alertsPhone?: string;
}

// Self-service — the garage sets its own notify.lk credentials. First
// tenant-facing settings endpoint in the app; branding/other Client fields
// are still super-admin-edited (ClientDetail.tsx), unchanged by this phase.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'sms:manage');
  if (!session) return;

  const { userId, apiKey, senderId, alertsPhone } = (req.body ?? {}) as SmsConfigBody;
  if (!userId || !apiKey) {
    return res.status(400).json({ error: 'userId and apiKey are required' });
  }

  await connectToDatabase();
  const client = (await Client.findOneAndUpdate(
    { _id: session.clientId },
    { smsConfig: { userId, apiKey, senderId }, alertsPhone: alertsPhone?.trim() || undefined },
    { returnDocument: 'after' }
  ).lean()) as ClientDoc;

  return res.status(200).json({ client: serializeClient(client) });
}

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { requireTenantPermission } from '../../auth.js';
import { computePendingDeliveries } from '../../pendingDeliveries.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'sf-deliveries:view');
  if (!session) return;

  await connectToDatabase();
  const deliveries = await computePendingDeliveries(session.clientId);
  return res.status(200).json({ deliveries });
}

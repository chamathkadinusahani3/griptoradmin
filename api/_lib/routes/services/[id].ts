import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Service, ServiceDoc } from '../../models/Service.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeService } from '../../serializers.js';

interface UpdateServiceBody {
  name?: string;
  category?: string;
  durationMinutes?: number;
  active?: boolean;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'services:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing service id' });

  await connectToDatabase();

  const existing = (await Service.findOne({ _id: id, clientId: session.clientId }).lean()) as ServiceDoc | null;
  if (!existing) return res.status(404).json({ error: 'Service not found' });

  const body = (req.body ?? {}) as UpdateServiceBody;
  const update: Record<string, unknown> = {};
  for (const key of ['name', 'category', 'durationMinutes', 'active'] as const) {
    if (body[key] !== undefined) update[key] = body[key];
  }

  const service = (await Service.findOneAndUpdate(
    { _id: id, clientId: session.clientId },
    update,
    { returnDocument: 'after' }
  ).lean()) as ServiceDoc;

  return res.status(200).json({ service: serializeService(service) });
}

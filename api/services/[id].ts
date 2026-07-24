import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../_lib/db';
import { Service, ServiceDoc } from '../_lib/models/Service';
import { requireTenant } from '../_lib/auth';
import { serializeService } from '../_lib/serializers';

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

  const session = requireTenant(req, res);
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

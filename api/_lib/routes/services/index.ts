import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Service, ServiceDoc } from '../../models/Service.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeService } from '../../serializers.js';

interface CreateServiceBody {
  name?: string;
  category?: string;
  durationMinutes?: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'services:view');
  if (!session) return;

  await connectToDatabase();
  const services = (await Service.find({ clientId: session.clientId }).sort({ name: 1 }).lean()) as ServiceDoc[];
  return res.status(200).json({ services: services.map(serializeService) });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'services:manage');
  if (!session) return;

  const { name, category, durationMinutes } = (req.body ?? {}) as CreateServiceBody;
  if (!name) return res.status(400).json({ error: 'name is required' });

  await connectToDatabase();
  const service = await Service.create({
    clientId: session.clientId,
    name,
    category,
    durationMinutes: durationMinutes ?? 30,
  });

  return res.status(201).json({ service: serializeService(service.toObject()) });
}

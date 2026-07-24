import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../_lib/db';
import { Service, ServiceDoc } from '../_lib/models/Service';
import { requireTenant } from '../_lib/auth';
import { serializeService } from '../_lib/serializers';

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
  const session = requireTenant(req, res);
  if (!session) return;

  await connectToDatabase();
  const services = (await Service.find({ clientId: session.clientId }).sort({ name: 1 }).lean()) as ServiceDoc[];
  return res.status(200).json({ services: services.map(serializeService) });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = requireTenant(req, res);
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

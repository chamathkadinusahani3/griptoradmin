import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Prospect, ProspectDoc, PROSPECT_SOURCES } from '../../models/Prospect.js';
import { User, UserDoc } from '../../models/User.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeProspect } from '../../serializers.js';

interface CreateProspectBody {
  name?: string;
  phone?: string;
  email?: string;
  source?: string;
  assignedTo?: string;
  notes?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'prospects:view');
  if (!session) return;

  await connectToDatabase();
  const prospects = (await Prospect.find({ clientId: session.clientId }).sort({ createdAt: -1 }).lean()) as ProspectDoc[];
  const userIds = [...new Set(prospects.map((p) => p.assignedTo?.toString()).filter(Boolean) as string[])];
  const users = (await User.find({ _id: { $in: userIds } }).select('name').lean()) as UserDoc[];
  const nameById = new Map(users.map((u) => [u._id.toString(), u.name]));

  return res.status(200).json({
    prospects: prospects.map((p) => serializeProspect(p, p.assignedTo ? nameById.get(p.assignedTo.toString()) : undefined)),
  });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'prospects:manage');
  if (!session) return;

  const { name, phone, email, source, assignedTo, notes } = (req.body ?? {}) as CreateProspectBody;
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  if (source !== undefined && !(PROSPECT_SOURCES as readonly string[]).includes(source)) {
    return res.status(400).json({ error: `source must be one of: ${PROSPECT_SOURCES.join(', ')}` });
  }

  await connectToDatabase();

  const prospect = await Prospect.create({
    clientId: session.clientId,
    name: name.trim(),
    phone,
    email,
    source,
    assignedTo: assignedTo || undefined,
    notes,
  });

  return res.status(201).json({ prospect: serializeProspect(prospect.toObject()) });
}

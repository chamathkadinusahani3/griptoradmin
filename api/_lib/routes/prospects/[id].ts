import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Prospect, ProspectDoc, PROSPECT_SOURCES } from '../../models/Prospect.js';
import { User } from '../../models/User.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeProspect } from '../../serializers.js';

interface UpdateProspectBody {
  name?: string;
  phone?: string;
  email?: string;
  source?: string;
  status?: string;
  assignedTo?: string | null;
  lostReason?: string;
  notes?: string;
}

const STATUSES = ['New', 'Contacted', 'Qualified', 'Converted', 'Lost'] as const;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'prospects:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing prospect id' });

  const body = (req.body ?? {}) as UpdateProspectBody;
  if (body.source !== undefined && !(PROSPECT_SOURCES as readonly string[]).includes(body.source)) {
    return res.status(400).json({ error: `source must be one of: ${PROSPECT_SOURCES.join(', ')}` });
  }
  if (body.status !== undefined && !(STATUSES as readonly string[]).includes(body.status)) {
    return res.status(400).json({ error: `status must be one of: ${STATUSES.join(', ')}` });
  }
  // 'Converted' is only ever set by prospects/[id]/convert.ts, which also
  // links convertedCustomerId — setting it here directly would leave a
  // "Converted" prospect with no real Customer behind it.
  if (body.status === 'Converted') {
    return res.status(400).json({ error: 'Use the convert action to mark a prospect Converted' });
  }

  await connectToDatabase();

  const existing = (await Prospect.findOne({ _id: id, clientId: session.clientId }).lean()) as ProspectDoc | null;
  if (!existing) return res.status(404).json({ error: 'Prospect not found' });
  if (existing.status === 'Converted') {
    return res.status(400).json({ error: 'A Converted prospect can no longer be edited' });
  }

  const update: Record<string, unknown> = {};
  for (const key of ['name', 'phone', 'email', 'source', 'status', 'lostReason', 'notes'] as const) {
    if (body[key] !== undefined) update[key] = body[key];
  }
  if (body.assignedTo !== undefined) update.assignedTo = body.assignedTo || undefined;

  const prospect = (await Prospect.findOneAndUpdate(
    { _id: id, clientId: session.clientId },
    update,
    { returnDocument: 'after' }
  ).lean()) as ProspectDoc;

  const assignedUser = prospect.assignedTo ? ((await User.findById(prospect.assignedTo).select('name').lean()) as { name: string } | null) : null;
  return res.status(200).json({ prospect: serializeProspect(prospect, assignedUser?.name) });
}

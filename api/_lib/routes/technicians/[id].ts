import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Technician, TechnicianDoc } from '../../models/Technician.js';
import { requireTenantPermission } from '../../auth.js';
import { isValidBranch } from '../../branch.js';
import { serializeTechnician } from '../../serializers.js';

interface UpdateTechnicianBody {
  name?: string;
  specialty?: string;
  branchId?: string | null;
  hourlyRate?: number | null;
  maxConcurrentJobs?: number;
  active?: boolean;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'technicians:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing technician id' });

  await connectToDatabase();

  const existing = await Technician.findOne({ _id: id, clientId: session.clientId }).lean();
  if (!existing) return res.status(404).json({ error: 'Technician not found' });

  const body = (req.body ?? {}) as UpdateTechnicianBody;
  if (body.branchId && !(await isValidBranch(session.clientId, body.branchId))) {
    return res.status(400).json({ error: 'Unknown branch' });
  }

  const update: Record<string, unknown> = {};
  for (const key of ['name', 'specialty', 'maxConcurrentJobs', 'active'] as const) {
    if (body[key] !== undefined) update[key] = body[key];
  }
  if (body.branchId !== undefined) update.branchId = body.branchId || null;
  if (body.hourlyRate !== undefined) update.hourlyRate = body.hourlyRate === null ? null : Number(body.hourlyRate) || 0;

  const technician = (await Technician.findOneAndUpdate(
    { _id: id, clientId: session.clientId },
    update,
    { returnDocument: 'after' }
  ).lean()) as TechnicianDoc;

  return res.status(200).json({ technician: serializeTechnician(technician) });
}

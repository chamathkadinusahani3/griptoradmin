import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../_lib/db';
import { Technician, TechnicianDoc } from '../_lib/models/Technician';
import { requireTenant } from '../_lib/auth';
import { isValidBranch } from '../_lib/branch';
import { serializeTechnician } from '../_lib/serializers';

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

  const session = requireTenant(req, res);
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

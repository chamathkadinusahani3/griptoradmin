import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Bay, BayDoc } from '../../models/Bay.js';
import { JobCard, JobCardDoc } from '../../models/JobCard.js';
import { Technician, TechnicianDoc } from '../../models/Technician.js';
import { requireTenantPermission } from '../../auth.js';
import { isValidBranch, resolveBranchFilter } from '../../branch.js';
import { serializeBay } from '../../serializers.js';

interface CreateBayBody {
  name?: string;
  branchId?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'bays:view');
  if (!session) return;

  await connectToDatabase();
  const { branchId } = req.query;
  const effectiveBranchId = resolveBranchFilter(session, typeof branchId === 'string' ? branchId : undefined);
  const bayFilter: Record<string, unknown> = { clientId: session.clientId };
  if (effectiveBranchId) bayFilter.branchId = effectiveBranchId;
  const bays = (await Bay.find(bayFilter).sort({ name: 1 }).lean()) as BayDoc[];

  // Occupancy is computed here, not stored — a bay is "Occupied" if some
  // active (non-Completed, non-Cancelled) job card currently points at it.
  // No separate occupancy field to keep in sync, same discipline as
  // Technician.activeJobs.
  const occupyingJobs = (await JobCard.find({
    clientId: session.clientId,
    bayId: { $in: bays.map((b) => b._id) },
    status: { $nin: ['Completed', 'Cancelled'] },
  }).lean()) as JobCardDoc[];
  const technicians = (await Technician.find({ clientId: session.clientId }).lean()) as TechnicianDoc[];
  const technicianNameById = new Map(technicians.map((t) => [t._id.toString(), t.name]));
  const jobByBayId = new Map(occupyingJobs.map((j) => [j.bayId!.toString(), j]));

  return res.status(200).json({
    bays: bays.map((bay) => {
      const job = jobByBayId.get(bay._id.toString());
      return serializeBay(
        bay,
        job
          ? {
              jobCardId: job._id.toString(),
              vehicle: job.vehicle,
              technician: technicianNameById.get(job.technicianId.toString()),
            }
          : null
      );
    }),
  });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'bays:manage');
  if (!session) return;

  const { name, branchId } = (req.body ?? {}) as CreateBayBody;
  if (!name) return res.status(400).json({ error: 'name is required' });

  await connectToDatabase();
  if (branchId && !(await isValidBranch(session.clientId, branchId))) {
    return res.status(400).json({ error: 'Unknown branch' });
  }
  const bay = await Bay.create({ clientId: session.clientId, name, branchId: branchId || undefined });

  return res.status(201).json({ bay: serializeBay(bay.toObject(), null) });
}

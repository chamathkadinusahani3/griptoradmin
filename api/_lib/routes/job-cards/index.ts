import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { JobCard, JobCardDoc } from '../../models/JobCard.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { Technician, TechnicianDoc } from '../../models/Technician.js';
import { Bay, BayDoc } from '../../models/Bay.js';
import { Vehicle } from '../../models/Vehicle.js';
import { requireTenantPermission } from '../../auth.js';
import { resolveBranchFilter } from '../../branch.js';
import { serializeJobCard } from '../../serializers.js';

interface CreateJobCardBody {
  customerId?: string;
  vehicle?: string;
  plate?: string;
  vehicleId?: string;
  service?: string;
  technicianId?: string;
  estimate?: number;
  status?: 'New' | 'In Progress' | 'Awaiting Parts' | 'Completed';
  bayId?: string;
  checklist?: { label: string; done: boolean }[];
  laborCost?: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'job-cards:view');
  if (!session) return;

  await connectToDatabase();
  const { branchId } = req.query;
  const effectiveBranchId = resolveBranchFilter(session, typeof branchId === 'string' ? branchId : undefined);
  const jobFilter: Record<string, unknown> = { clientId: session.clientId };
  if (effectiveBranchId) jobFilter.branchId = effectiveBranchId;
  const jobs = (await JobCard.find(jobFilter).sort({ createdAt: -1 }).lean()) as JobCardDoc[];
  const customers = (await Customer.find({ clientId: session.clientId }).lean()) as CustomerDoc[];
  const technicians = (await Technician.find({ clientId: session.clientId }).lean()) as TechnicianDoc[];
  const bays = (await Bay.find({ clientId: session.clientId }).lean()) as BayDoc[];
  const customerNameById = new Map(customers.map((c) => [c._id.toString(), c.name]));
  const technicianNameById = new Map(technicians.map((t) => [t._id.toString(), t.name]));
  const bayNameById = new Map(bays.map((b) => [b._id.toString(), b.name]));

  return res.status(200).json({
    jobCards: jobs.map((j) =>
      serializeJobCard(
        j,
        customerNameById.get(j.customerId.toString()),
        technicianNameById.get(j.technicianId.toString()),
        j.bayId ? bayNameById.get(j.bayId.toString()) : undefined
      )
    ),
  });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'job-cards:manage');
  if (!session) return;

  const { customerId, vehicle, plate, vehicleId, service, technicianId, estimate, status, bayId, checklist, laborCost } = (req.body ?? {}) as CreateJobCardBody;
  if (!customerId || !vehicle || !technicianId) {
    return res.status(400).json({ error: 'customerId, vehicle, and technicianId are required' });
  }

  await connectToDatabase();

  const customer = await Customer.findOne({ _id: customerId, clientId: session.clientId }).lean();
  if (!customer) return res.status(400).json({ error: 'Unknown customer' });
  const technician = await Technician.findOne({ _id: technicianId, clientId: session.clientId }).lean();
  if (!technician) return res.status(400).json({ error: 'Unknown technician' });
  let bay: BayDoc | null = null;
  if (bayId) {
    bay = (await Bay.findOne({ _id: bayId, clientId: session.clientId }).lean()) as BayDoc | null;
    if (!bay) return res.status(400).json({ error: 'Unknown bay' });
  }
  if (vehicleId) {
    const vehicleDoc = await Vehicle.findOne({ _id: vehicleId, clientId: session.clientId, customerId }).lean();
    if (!vehicleDoc) return res.status(400).json({ error: 'Unknown vehicle' });
  }

  // A job card's branch is derived from its assigned technician (who
  // already belongs to one branch) rather than trusting a separate
  // client-sent branchId that could disagree with it.
  const job = await JobCard.create({
    clientId: session.clientId,
    customerId,
    vehicle,
    plate,
    vehicleId: vehicleId || undefined,
    service,
    technicianId,
    estimate: estimate ?? 0,
    status: status ?? 'New',
    bayId: bayId || undefined,
    branchId: (technician as TechnicianDoc).branchId ?? bay?.branchId,
    checklist: checklist ?? [],
    laborCost: laborCost ?? 0,
    startedAt: status === 'In Progress' ? new Date() : undefined,
  });

  return res.status(201).json({
    jobCard: serializeJobCard(job.toObject(), (customer as CustomerDoc).name, (technician as TechnicianDoc).name, bay?.name),
  });
}

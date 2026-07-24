import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../_lib/db';
import { JobCard, JobCardDoc } from '../_lib/models/JobCard';
import { Customer, CustomerDoc } from '../_lib/models/Customer';
import { Technician, TechnicianDoc } from '../_lib/models/Technician';
import { Bay, BayDoc } from '../_lib/models/Bay';
import { requireTenant } from '../_lib/auth';
import { serializeJobCard } from '../_lib/serializers';

interface UpdateJobCardBody {
  customerId?: string;
  vehicle?: string;
  plate?: string;
  vehicleId?: string | null;
  service?: string;
  technicianId?: string;
  estimate?: number;
  status?: 'New' | 'In Progress' | 'Awaiting Parts' | 'Completed';
  bayId?: string | null;
  checklist?: { label: string; done: boolean }[];
  laborCost?: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = requireTenant(req, res);
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing job card id' });

  await connectToDatabase();

  // Scoped by BOTH _id and clientId — the write-by-id multi-tenancy boundary.
  const existing = (await JobCard.findOne({ _id: id, clientId: session.clientId }).lean()) as JobCardDoc | null;
  if (!existing) return res.status(404).json({ error: 'Job card not found' });

  const body = (req.body ?? {}) as UpdateJobCardBody;
  const update: Record<string, unknown> = {};
  for (const key of ['customerId', 'vehicle', 'plate', 'service', 'technicianId', 'estimate', 'status', 'bayId', 'checklist', 'laborCost'] as const) {
    if (body[key] !== undefined) update[key] = body[key];
  }
  // '' from the form means "no saved vehicle selected" — normalize to null
  // rather than trying to cast an empty string into an ObjectId field.
  if (body.vehicleId !== undefined) update.vehicleId = body.vehicleId || null;

  const justCompleted = existing.status !== 'Completed' && body.status === 'Completed';
  // Stamped once — re-saving an already-'In Progress' job (e.g. editing its
  // notes) doesn't reset the clock.
  const justStarted = existing.status !== 'In Progress' && body.status === 'In Progress' && !existing.startedAt;
  if (justStarted) update.startedAt = new Date();
  if (justCompleted) update.completedAt = new Date();

  const job = (await JobCard.findOneAndUpdate(
    { _id: id, clientId: session.clientId },
    update,
    { returnDocument: 'after' }
  ).lean()) as JobCardDoc;

  if (justCompleted) {
    await Customer.updateOne(
      { _id: job.customerId, clientId: session.clientId },
      { $inc: { visits: 1, totalSpend: job.estimate }, $set: { lastVisit: new Date() } }
    );
  }

  const customer = (await Customer.findById(job.customerId).lean()) as CustomerDoc | null;
  const technician = (await Technician.findById(job.technicianId).lean()) as TechnicianDoc | null;
  const bay = job.bayId ? ((await Bay.findById(job.bayId).lean()) as BayDoc | null) : null;

  return res.status(200).json({ jobCard: serializeJobCard(job, customer?.name, technician?.name, bay?.name) });
}

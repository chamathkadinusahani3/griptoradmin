import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { connectToDatabase } from '../../db.js';
import { Inspection, InspectionDoc } from '../../models/Inspection.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { Technician, TechnicianDoc } from '../../models/Technician.js';
import { JobCard } from '../../models/JobCard.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeInspection } from '../../serializers.js';

interface MediaInput {
  url: string;
  type: 'image' | 'video';
}

interface CreateInspectionBody {
  customerId?: string;
  technicianId?: string;
  jobCardId?: string;
  vehicle?: string;
  plate?: string;
  result?: 'Pass' | 'Advisory' | 'Fail';
  notes?: string;
  media?: MediaInput[];
  additionalCost?: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'inspections:view');
  if (!session) return;

  await connectToDatabase();
  const inspections = (await Inspection.find({ clientId: session.clientId }).sort({ createdAt: -1 }).lean()) as InspectionDoc[];
  const customers = (await Customer.find({ clientId: session.clientId }).lean()) as CustomerDoc[];
  const technicians = (await Technician.find({ clientId: session.clientId }).lean()) as TechnicianDoc[];
  const customerNameById = new Map(customers.map((c) => [c._id.toString(), c.name]));
  const technicianNameById = new Map(technicians.map((t) => [t._id.toString(), t.name]));

  return res.status(200).json({
    inspections: inspections.map((i) =>
      serializeInspection(i, customerNameById.get(i.customerId.toString()), technicianNameById.get(i.technicianId.toString()))
    ),
  });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'inspections:manage');
  if (!session) return;

  const { customerId, technicianId, jobCardId, vehicle, plate, result, notes, media, additionalCost } =
    (req.body ?? {}) as CreateInspectionBody;

  if (!customerId || !technicianId || !vehicle || !result) {
    return res.status(400).json({ error: 'customerId, technicianId, vehicle, and result are required' });
  }

  await connectToDatabase();

  const customer = await Customer.findOne({ _id: customerId, clientId: session.clientId }).lean();
  if (!customer) return res.status(400).json({ error: 'Unknown customer' });

  const technician = await Technician.findOne({ _id: technicianId, clientId: session.clientId }).lean();
  if (!technician) return res.status(400).json({ error: 'Unknown technician' });

  if (jobCardId) {
    const jobCard = await JobCard.findOne({ _id: jobCardId, clientId: session.clientId }).lean();
    if (!jobCard) return res.status(400).json({ error: 'Unknown job card' });
  }

  const needsApproval = typeof additionalCost === 'number' && additionalCost > 0;

  const inspection = await Inspection.create({
    clientId: session.clientId,
    customerId,
    technicianId,
    jobCardId: jobCardId || undefined,
    vehicle,
    plate,
    result,
    notes,
    media: media ?? [],
    additionalCost,
    approvalStatus: needsApproval ? 'pending' : 'not_required',
    approvalToken: needsApproval ? crypto.randomBytes(24).toString('hex') : undefined,
    approvalRequestedAt: needsApproval ? new Date() : undefined,
  });

  return res
    .status(201)
    .json({ inspection: serializeInspection(inspection.toObject(), (customer as { name: string }).name, (technician as { name: string }).name) });
}

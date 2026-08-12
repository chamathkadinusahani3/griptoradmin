import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../../db.js';
import { Quotation, QuotationDoc } from '../../../models/Quotation.js';
import { Customer, CustomerDoc } from '../../../models/Customer.js';
import { Technician, TechnicianDoc } from '../../../models/Technician.js';
import { JobCard } from '../../../models/JobCard.js';
import { requireTenantPermission } from '../../../auth.js';
import { serializeJobCard } from '../../../serializers.js';

interface ConvertBody {
  technicianId?: string;
}

// Mirrors api/_lib/routes/bookings/[id]/convert.ts's Booking -> JobCard
// pattern for the same reason: JobCard.technicianId is required, so this is
// a deliberate staff action (picking who does the work), never automatic.
// Only valid from an Approved quotation, and only once — the quotation's
// own status is left untouched (still 'Approved'); jobCardId is what marks
// it as started.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'quotations:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing quotation id' });

  const { technicianId } = (req.body ?? {}) as ConvertBody;
  if (!technicianId) return res.status(400).json({ error: 'technicianId is required' });

  await connectToDatabase();

  const quotation = (await Quotation.findOne({ _id: id, clientId: session.clientId }).lean()) as QuotationDoc | null;
  if (!quotation) return res.status(404).json({ error: 'Quotation not found' });
  if (quotation.jobCardId) return res.status(400).json({ error: 'This quotation already has a job card' });
  if (quotation.status !== 'Approved') {
    return res.status(400).json({ error: 'Only an Approved quotation can be started as a job' });
  }

  const technician = await Technician.findOne({ _id: technicianId, clientId: session.clientId }).lean();
  if (!technician) return res.status(400).json({ error: 'Unknown technician' });

  const customer = await Customer.findOne({ _id: quotation.customerId, clientId: session.clientId }).lean();
  if (!customer) return res.status(400).json({ error: 'Customer no longer exists' });

  const jobCard = await JobCard.create({
    clientId: session.clientId,
    customerId: quotation.customerId,
    vehicle: quotation.vehicle,
    plate: quotation.plate,
    vehicleId: quotation.vehicleId,
    technicianId,
    estimate: quotation.total,
    status: 'New',
    branchId: (technician as TechnicianDoc).branchId,
    checklist: quotation.items.map((item) => ({ label: item.description, done: false })),
  });

  await Quotation.updateOne({ _id: id, clientId: session.clientId }, { jobCardId: jobCard._id });

  return res.status(201).json({
    jobCard: serializeJobCard(jobCard.toObject(), (customer as CustomerDoc).name, (technician as TechnicianDoc).name),
  });
}

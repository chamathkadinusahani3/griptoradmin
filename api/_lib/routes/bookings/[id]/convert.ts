import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../../db.js';
import { Booking, BookingDoc } from '../../../models/Booking.js';
import { Customer } from '../../../models/Customer.js';
import { Technician } from '../../../models/Technician.js';
import { Service, ServiceDoc } from '../../../models/Service.js';
import { JobCard } from '../../../models/JobCard.js';
import { requireTenantPermission } from '../../../auth.js';
import { serializeJobCard } from '../../../serializers.js';

interface ConvertBody {
  technicianId?: string;
}

// A deliberate staff action, not automatic — JobCard.technicianId is a
// required field on that model, so a booking can't become a job card until
// someone is assigned to it.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'bookings:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing booking id' });

  const { technicianId } = (req.body ?? {}) as ConvertBody;
  if (!technicianId) return res.status(400).json({ error: 'technicianId is required' });

  await connectToDatabase();

  const booking = (await Booking.findOne({ _id: id, clientId: session.clientId }).lean()) as BookingDoc | null;
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  if (booking.jobCardId) return res.status(400).json({ error: 'This booking already has a job card' });

  const technician = await Technician.findOne({ _id: technicianId, clientId: session.clientId }).lean();
  if (!technician) return res.status(400).json({ error: 'Unknown technician' });

  const customer = await Customer.findOne({ _id: booking.customerId, clientId: session.clientId }).lean();
  if (!customer) return res.status(400).json({ error: 'Customer no longer exists' });

  const services = (await Service.find({ _id: { $in: booking.serviceIds } }).lean()) as ServiceDoc[];
  const serviceLabel = services.map((s) => s.name).join(', ');

  const jobCard = await JobCard.create({
    clientId: session.clientId,
    customerId: booking.customerId,
    vehicle: booking.vehicle,
    plate: booking.plate,
    service: serviceLabel,
    technicianId,
    estimate: 0,
    status: 'New',
  });

  await Booking.updateOne({ _id: id, clientId: session.clientId }, { jobCardId: jobCard._id });

  return res.status(201).json({
    jobCard: serializeJobCard(jobCard.toObject(), (customer as { name: string }).name, (technician as { name: string }).name),
  });
}

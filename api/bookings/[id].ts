import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../_lib/db';
import { Booking, BookingDoc } from '../_lib/models/Booking';
import { Customer, CustomerDoc } from '../_lib/models/Customer';
import { Service, ServiceDoc } from '../_lib/models/Service';
import { requireTenant } from '../_lib/auth';
import { serializeBooking } from '../_lib/serializers';

interface UpdateBookingBody {
  status?: 'Pending' | 'Confirmed' | 'Completed' | 'Cancelled';
  notes?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = requireTenant(req, res);
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing booking id' });

  await connectToDatabase();

  // Scoped by BOTH _id and clientId — the write-by-id multi-tenancy boundary.
  const existing = (await Booking.findOne({ _id: id, clientId: session.clientId }).lean()) as BookingDoc | null;
  if (!existing) return res.status(404).json({ error: 'Booking not found' });

  const body = (req.body ?? {}) as UpdateBookingBody;
  const update: Record<string, unknown> = {};
  for (const key of ['status', 'notes'] as const) {
    if (body[key] !== undefined) update[key] = body[key];
  }

  const booking = (await Booking.findOneAndUpdate(
    { _id: id, clientId: session.clientId },
    update,
    { returnDocument: 'after' }
  ).lean()) as BookingDoc;

  const customer = (await Customer.findById(booking.customerId).lean()) as CustomerDoc | null;
  const services = (await Service.find({ _id: { $in: booking.serviceIds } }).lean()) as ServiceDoc[];

  return res
    .status(200)
    .json({ booking: serializeBooking(booking, customer?.name, services.map((s) => s.name)) });
}

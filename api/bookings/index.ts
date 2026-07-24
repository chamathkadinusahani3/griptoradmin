import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../_lib/db';
import { Booking, BookingDoc } from '../_lib/models/Booking';
import { Customer, CustomerDoc } from '../_lib/models/Customer';
import { Service, ServiceDoc } from '../_lib/models/Service';
import { requireTenant } from '../_lib/auth';
import { isValidBranch, resolveBranchFilter } from '../_lib/branch';
import { serializeBooking } from '../_lib/serializers';
import { createBookingWithCapacityCheck } from '../_lib/booking';

interface CreateBookingBody {
  customerId?: string;
  serviceIds?: string[];
  vehicle?: string;
  plate?: string;
  date?: string;
  timeSlot?: string;
  notes?: string;
  branchId?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = requireTenant(req, res);
  if (!session) return;

  await connectToDatabase();
  const { branchId: branchFilter } = req.query;
  const effectiveBranchId = resolveBranchFilter(session, typeof branchFilter === 'string' ? branchFilter : undefined);
  const bookingFilter: Record<string, unknown> = { clientId: session.clientId };
  if (effectiveBranchId) bookingFilter.branchId = effectiveBranchId;
  const bookings = (await Booking.find(bookingFilter).sort({ date: -1, timeSlot: -1 }).lean()) as BookingDoc[];
  const customers = (await Customer.find({ clientId: session.clientId }).lean()) as CustomerDoc[];
  const services = (await Service.find({ clientId: session.clientId }).lean()) as ServiceDoc[];
  const customerNameById = new Map(customers.map((c) => [c._id.toString(), c.name]));
  const serviceNameById = new Map(services.map((s) => [s._id.toString(), s.name]));

  return res.status(200).json({
    bookings: bookings.map((b) =>
      serializeBooking(
        b,
        customerNameById.get(b.customerId.toString()),
        b.serviceIds.map((id) => serviceNameById.get(id.toString()) ?? 'Unknown service')
      )
    ),
  });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = requireTenant(req, res);
  if (!session) return;

  const { customerId, serviceIds, vehicle, plate, date, timeSlot, notes, branchId: requestedBranchId } = (req.body ?? {}) as CreateBookingBody;
  const branchId = resolveBranchFilter(session, requestedBranchId);
  if (!customerId || !serviceIds || serviceIds.length === 0 || !vehicle || !date || !timeSlot) {
    return res.status(400).json({ error: 'customerId, serviceIds, vehicle, date, and timeSlot are required' });
  }

  await connectToDatabase();

  const customer = await Customer.findOne({ _id: customerId, clientId: session.clientId }).lean();
  if (!customer) return res.status(400).json({ error: 'Unknown customer' });

  const services = await Service.find({ _id: { $in: serviceIds }, clientId: session.clientId }).lean();
  if (services.length !== serviceIds.length) return res.status(400).json({ error: 'Unknown service' });

  if (branchId && !(await isValidBranch(session.clientId, branchId))) {
    return res.status(400).json({ error: 'Unknown branch' });
  }

  try {
    const booking = await createBookingWithCapacityCheck({
      clientId: session.clientId,
      customerId,
      serviceIds,
      vehicle,
      plate,
      date: new Date(date),
      timeSlot,
      notes,
      source: 'staff',
      branchId,
    });
    return res
      .status(201)
      .json({ booking: serializeBooking(booking, (customer as { name: string }).name, services.map((s) => (s as { name: string }).name)) });
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
    return res.status(statusCode).json({ error: err instanceof Error ? err.message : 'Failed to create booking' });
  }
}

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Booking, BookingDoc } from '../../models/Booking.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { Service, ServiceDoc } from '../../models/Service.js';
import { Bay, BayDoc } from '../../models/Bay.js';
import { Branch } from '../../models/Branch.js';
import { requireTenantPermission } from '../../auth.js';
import { isValidBranch, resolveBranchFilter } from '../../branch.js';
import { serializeBooking } from '../../serializers.js';
import { createBookingWithCapacityCheck } from '../../booking.js';
import { isValidSriLankanPlate, normalizePlate } from '../../plate.js';

interface CreateBookingBody {
  customerId?: string;
  serviceIds?: string[];
  vehicle?: string;
  plate?: string;
  date?: string;
  timeSlot?: string;
  notes?: string;
  branchId?: string;
  bayId?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'bookings:view');
  if (!session) return;

  await connectToDatabase();
  const { branchId: branchFilter, status, date } = req.query;
  const effectiveBranchId = resolveBranchFilter(session, typeof branchFilter === 'string' ? branchFilter : undefined);
  const bookingFilter: Record<string, unknown> = { clientId: session.clientId };
  if (effectiveBranchId) bookingFilter.branchId = effectiveBranchId;
  if (typeof status === 'string' && status) bookingFilter.status = status;
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    bookingFilter.date = { $gte: new Date(`${date}T00:00:00.000Z`), $lte: new Date(`${date}T23:59:59.999Z`) };
  }

  const bookings = (await Booking.find(bookingFilter).sort({ date: -1, timeSlot: -1 }).lean()) as BookingDoc[];
  const customers = (await Customer.find({ clientId: session.clientId }).lean()) as CustomerDoc[];
  const services = (await Service.find({ clientId: session.clientId }).lean()) as ServiceDoc[];
  const bays = (await Bay.find({ clientId: session.clientId }).lean()) as BayDoc[];
  const customerNameById = new Map(customers.map((c) => [c._id.toString(), c.name]));
  const serviceNameById = new Map(services.map((s) => [s._id.toString(), s.name]));
  const bayNameById = new Map(bays.map((b) => [b._id.toString(), b.name]));

  return res.status(200).json({
    bookings: bookings.map((b) =>
      serializeBooking(
        b,
        customerNameById.get(b.customerId.toString()),
        b.serviceIds.map((id) => serviceNameById.get(id.toString()) ?? 'Unknown service'),
        b.bayId ? bayNameById.get(b.bayId.toString()) : undefined
      )
    ),
  });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'bookings:manage');
  if (!session) return;

  const { customerId, serviceIds, vehicle, plate, date, timeSlot, notes, branchId: requestedBranchId, bayId } =
    (req.body ?? {}) as CreateBookingBody;
  const branchId = resolveBranchFilter(session, requestedBranchId);
  if (!customerId || !serviceIds || serviceIds.length === 0 || !vehicle || !date || !timeSlot) {
    return res.status(400).json({ error: 'customerId, serviceIds, vehicle, date, and timeSlot are required' });
  }
  if (plate && !isValidSriLankanPlate(plate)) {
    return res.status(400).json({ error: 'That doesn’t look like a valid plate number' });
  }

  await connectToDatabase();

  const branchCount = await Branch.countDocuments({ clientId: session.clientId });
  if (branchCount > 1 && !branchId) {
    return res.status(400).json({ error: 'branchId is required for a multi-branch garage' });
  }

  const customer = await Customer.findOne({ _id: customerId, clientId: session.clientId }).lean();
  if (!customer) return res.status(400).json({ error: 'Unknown customer' });

  const services = await Service.find({ _id: { $in: serviceIds }, clientId: session.clientId }).lean();
  if (services.length !== serviceIds.length) return res.status(400).json({ error: 'Unknown service' });

  if (branchId && !(await isValidBranch(session.clientId, branchId))) {
    return res.status(400).json({ error: 'Unknown branch' });
  }

  if (bayId && !(await Bay.exists({ _id: bayId, clientId: session.clientId }))) {
    return res.status(400).json({ error: 'Unknown bay' });
  }

  try {
    const booking = await createBookingWithCapacityCheck({
      clientId: session.clientId,
      customerId,
      serviceIds,
      vehicle,
      plate: plate ? normalizePlate(plate) : undefined,
      date: new Date(date),
      timeSlot,
      notes,
      source: 'staff',
      branchId,
      bayId,
    });
    return res
      .status(201)
      .json({ booking: serializeBooking(booking, (customer as { name: string }).name, services.map((s) => (s as { name: string }).name)) });
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
    return res.status(statusCode).json({ error: err instanceof Error ? err.message : 'Failed to create booking' });
  }
}

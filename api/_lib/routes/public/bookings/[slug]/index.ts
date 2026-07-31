import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../../../db.js';
import { Client, ClientDoc } from '../../../../models/Client.js';
import { Customer, CustomerDoc } from '../../../../models/Customer.js';
import { Service, ServiceDoc } from '../../../../models/Service.js';
import { Branch, BranchDoc } from '../../../../models/Branch.js';
import { isValidBranch } from '../../../../branch.js';
import { serializeService, serializePublicBooking, serializeBranch } from '../../../../serializers.js';
import { createBookingWithCapacityCheck } from '../../../../booking.js';

// Public, unauthenticated — same-origin (the wizard lives at /book/:slug
// within this app), same reasoning as api/public/inspections/[token].ts:
// no CORS handling needed. Identified by the tenant's slug, never clientId.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

function getSlug(req: VercelRequest): string | null {
  const { slug } = req.query;
  return typeof slug === 'string' ? slug : null;
}

async function handleGet(req: VercelRequest, res: VercelResponse) {
  const slug = getSlug(req);
  if (!slug) return res.status(400).json({ error: 'Missing slug' });

  await connectToDatabase();
  const client = (await Client.findOne({ slug }).lean()) as ClientDoc | null;
  if (!client) return res.status(404).json({ error: 'Not found' });

  const services = (await Service.find({ clientId: client._id, active: true }).sort({ name: 1 }).lean()) as ServiceDoc[];
  const branches = (await Branch.find({ clientId: client._id }).sort({ name: 1 }).lean()) as BranchDoc[];

  return res.status(200).json({
    clientName: client.name,
    services: services.map(serializeService),
    // Only meaningful when there's more than one — PublicBooking.tsx shows
    // a branch picker only in that case.
    branches: branches.map(serializeBranch),
  });
}

interface CreateBookingBody {
  serviceIds?: string[];
  date?: string;
  timeSlot?: string;
  name?: string;
  email?: string;
  phone?: string;
  vehicle?: string;
  plate?: string;
  branchId?: string;
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const slug = getSlug(req);
  if (!slug) return res.status(400).json({ error: 'Missing slug' });

  const { serviceIds, date, timeSlot, name, email, phone, vehicle, plate, branchId } = (req.body ?? {}) as CreateBookingBody;
  if (!serviceIds || serviceIds.length === 0 || !date || !timeSlot || !name || !email || !phone || !vehicle) {
    return res.status(400).json({ error: 'serviceIds, date, timeSlot, name, email, phone, and vehicle are required' });
  }

  await connectToDatabase();
  const client = (await Client.findOne({ slug }).lean()) as ClientDoc | null;
  if (!client) return res.status(404).json({ error: 'Not found' });

  const services = await Service.find({ _id: { $in: serviceIds }, clientId: client._id, active: true }).lean();
  if (services.length !== serviceIds.length) {
    return res.status(400).json({ error: 'One or more selected services are no longer available' });
  }
  if (branchId && !(await isValidBranch(client._id.toString(), branchId))) {
    return res.status(400).json({ error: 'Unknown branch' });
  }

  const normalizedEmail = email.toLowerCase().trim();
  let customer = (await Customer.findOne({ clientId: client._id, email: normalizedEmail }).lean()) as CustomerDoc | null;
  if (!customer) {
    const created = await Customer.create({ clientId: client._id, name, email: normalizedEmail, phone });
    customer = created.toObject() as CustomerDoc;
  }

  try {
    const booking = await createBookingWithCapacityCheck({
      clientId: client._id.toString(),
      customerId: customer._id.toString(),
      serviceIds,
      vehicle,
      plate,
      date: new Date(date),
      timeSlot,
      source: 'public',
      branchId,
    });
    return res.status(201).json({ booking: serializePublicBooking(booking) });
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
    return res.status(statusCode).json({ error: err instanceof Error ? err.message : 'Failed to create booking' });
  }
}

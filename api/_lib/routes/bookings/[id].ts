import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Booking, BookingDoc } from '../../models/Booking.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { Service, ServiceDoc } from '../../models/Service.js';
import { Bay, BayDoc } from '../../models/Bay.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeBooking } from '../../serializers.js';

type BookingStatus = 'Pending' | 'Waiting' | 'In Progress' | 'Completed' | 'Cancelled';

interface UpdateBookingBody {
  status?: BookingStatus;
  notes?: string;
  bayId?: string | null;
}

// Server-enforced transition table — the frontend's confirmation-dialog
// buttons only ever offer a subset of these, but this is the real boundary:
// previously any status could go to any other status via a raw PATCH.
// Completed/Cancelled are terminal (no further status change via this
// endpoint).
const ALLOWED_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  Pending: ['Waiting', 'In Progress', 'Cancelled'],
  Waiting: ['In Progress', 'Cancelled'],
  'In Progress': ['Completed', 'Cancelled'],
  Completed: [],
  Cancelled: [],
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'bookings:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing booking id' });

  await connectToDatabase();

  // Scoped by BOTH _id and clientId — the write-by-id multi-tenancy boundary.
  const existing = (await Booking.findOne({ _id: id, clientId: session.clientId }).lean()) as BookingDoc | null;
  if (!existing) return res.status(404).json({ error: 'Booking not found' });

  const body = (req.body ?? {}) as UpdateBookingBody;

  if (body.status !== undefined && body.status !== existing.status) {
    const allowed = ALLOWED_TRANSITIONS[existing.status as BookingStatus] ?? [];
    if (!allowed.includes(body.status)) {
      return res.status(400).json({ error: `Can't move a booking from "${existing.status}" to "${body.status}"` });
    }
  }

  if (body.bayId) {
    const validBay = await Bay.exists({ _id: body.bayId, clientId: session.clientId });
    if (!validBay) return res.status(400).json({ error: 'Unknown bay' });
  }

  const update: Record<string, unknown> = {};
  const unset: Record<string, 1> = {};
  if (body.status !== undefined) update.status = body.status;
  if (body.notes !== undefined) update.notes = body.notes;
  if (body.bayId !== undefined) {
    if (body.bayId === null) unset.bayId = 1;
    else update.bayId = body.bayId;
  }

  const updateOp: Record<string, unknown> = {
    ...(Object.keys(update).length > 0 ? { $set: update } : {}),
    ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}),
  };

  const booking = (await Booking.findOneAndUpdate(
    { _id: id, clientId: session.clientId },
    updateOp,
    { returnDocument: 'after' }
  ).lean()) as BookingDoc;

  const customer = (await Customer.findById(booking.customerId).lean()) as CustomerDoc | null;
  const services = (await Service.find({ _id: { $in: booking.serviceIds } }).lean()) as ServiceDoc[];
  const bay = booking.bayId ? ((await Bay.findById(booking.bayId).lean()) as BayDoc | null) : null;

  return res
    .status(200)
    .json({ booking: serializeBooking(booking, customer?.name, services.map((s) => s.name), bay?.name) });
}

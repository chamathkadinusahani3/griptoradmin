import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { SalesVisit, SalesVisitDoc } from '../../models/SalesVisit.js';
import { Salesperson, SalespersonDoc } from '../../models/Salesperson.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeSalesVisit } from '../../serializers.js';
import { computeVisitTripMetrics } from '../../tripCalc.js';

interface UpdateVisitBody {
  action?: 'checkin' | 'checkout' | 'cancel' | 'reschedule';
  visitDate?: string;
  purpose?: string;
  notes?: string;
  lat?: number;
  lng?: number;
}

function isValidCoord(lat: unknown, lng: unknown): lat is number {
  return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'PATCH') return handleUpdate(req, res);
  if (req.method === 'DELETE') return handleDelete(req, res);
  res.setHeader('Allow', 'PATCH, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleUpdate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'sf-visits:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing visit id' });

  const body = (req.body ?? {}) as UpdateVisitBody;

  await connectToDatabase();

  const existing = (await SalesVisit.findOne({ _id: id, clientId: session.clientId }).lean()) as SalesVisitDoc | null;
  if (!existing) return res.status(404).json({ error: 'Visit not found' });

  let update: Record<string, unknown> | null = null;

  if (body.action) {
    if (body.action === 'checkin') {
      if (existing.status !== 'Pending' && existing.status !== 'Rescheduled') {
        return res.status(400).json({ error: 'Only a Pending or Rescheduled visit can be checked in' });
      }
      update = { status: 'In Progress', checkInAt: new Date() };
      if (isValidCoord(body.lat, body.lng)) {
        update.checkInLat = body.lat;
        update.checkInLng = body.lng;
      }
    } else if (body.action === 'checkout') {
      if (existing.status !== 'In Progress') {
        return res.status(400).json({ error: 'Only an In Progress visit can be checked out' });
      }
      const checkOutAt = new Date();
      const durationMinutes = existing.checkInAt ? Math.round((checkOutAt.getTime() - new Date(existing.checkInAt).getTime()) / 60000) : undefined;
      update = { status: 'Completed', checkOutAt, completedAt: checkOutAt, durationMinutes };
      if (isValidCoord(body.lat, body.lng)) {
        update.checkOutLat = body.lat;
        update.checkOutLng = body.lng;
      }
    } else if (body.action === 'cancel') {
      if (existing.status === 'Completed' || existing.status === 'Cancelled') {
        return res.status(400).json({ error: 'This visit cannot be cancelled' });
      }
      update = { status: 'Cancelled', cancelledAt: new Date() };
    } else if (body.action === 'reschedule') {
      if (existing.status !== 'Pending' && existing.status !== 'Rescheduled') {
        return res.status(400).json({ error: 'Only a Pending or Rescheduled visit can be rescheduled' });
      }
      if (!body.visitDate) return res.status(400).json({ error: 'visitDate is required to reschedule' });
      const newDate = new Date(body.visitDate);
      if (Number.isNaN(newDate.getTime())) return res.status(400).json({ error: 'Invalid visitDate' });
      update = { status: 'Rescheduled', visitDate: newDate, rescheduledFrom: existing.visitDate };
    } else {
      return res.status(400).json({ error: 'Invalid action' });
    }
  } else {
    update = {};
    if (body.purpose !== undefined) update.purpose = body.purpose;
    if (body.notes !== undefined) update.notes = body.notes;
    if (Object.keys(update).length === 0) return res.status(400).json({ error: 'Nothing to update' });
  }

  const visit = (await SalesVisit.findOneAndUpdate({ _id: id, clientId: session.clientId }, update, { returnDocument: 'after' }).lean()) as SalesVisitDoc;

  const [salesperson, customer, tripMetrics] = await Promise.all([
    Salesperson.findOne({ _id: visit.salespersonId, clientId: session.clientId }).lean() as Promise<SalespersonDoc | null>,
    Customer.findOne({ _id: visit.customerId, clientId: session.clientId }).lean() as Promise<CustomerDoc | null>,
    computeVisitTripMetrics(session.clientId, [visit]),
  ]);
  const metrics = tripMetrics.get(visit._id.toString());

  return res.status(200).json({
    visit: serializeSalesVisit(visit, {
      salespersonName: salesperson?.name,
      salespersonCode: salesperson?.code,
      customerName: customer?.name,
      tripDistanceKm: metrics?.tripDistanceKm ?? null,
      estimatedFuelCost: metrics?.estimatedFuelCost ?? null,
    }),
  });
}

async function handleDelete(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'sf-visits:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing visit id' });

  await connectToDatabase();

  const existing = await SalesVisit.findOne({ _id: id, clientId: session.clientId }).lean();
  if (!existing) return res.status(404).json({ error: 'Visit not found' });
  if ((existing as SalesVisitDoc).status !== 'Pending') {
    return res.status(400).json({ error: 'Only a Pending visit can be deleted' });
  }

  await SalesVisit.deleteOne({ _id: id, clientId: session.clientId });
  return res.status(204).end();
}

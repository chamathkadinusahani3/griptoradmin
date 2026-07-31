import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Booking, BookingDoc } from '../../models/Booking.js';
import { Service, ServiceDoc } from '../../models/Service.js';
import { requireCustomer } from '../../auth.js';
import { serializeBooking } from '../../serializers.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = requireCustomer(req, res);
  if (!session) return;

  await connectToDatabase();
  const bookings = (await Booking.find({ clientId: session.clientId, customerId: session.customerId })
    .sort({ date: -1 })
    .lean()) as BookingDoc[];
  const services = (await Service.find({ clientId: session.clientId }).lean()) as ServiceDoc[];
  const serviceNameById = new Map(services.map((s) => [s._id.toString(), s.name]));

  return res.status(200).json({
    bookings: bookings.map((b) => serializeBooking(b, undefined, b.serviceIds.map((id) => serviceNameById.get(id.toString()) ?? 'Unknown'))),
  });
}

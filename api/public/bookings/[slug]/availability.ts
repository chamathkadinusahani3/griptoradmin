import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../../_lib/db';
import { Client, ClientDoc } from '../../../_lib/models/Client';
import { Booking } from '../../../_lib/models/Booking';

// Fixed hourly slots, 09:00–17:00 — lives only here, not duplicated in the
// frontend (unlike the Anura reference, where the same slot list is
// hand-copied into both the wizard and the backend and can drift out of
// sync). The wizard just renders whatever this endpoint returns.
const TIME_SLOTS = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { slug, date } = req.query;
  if (typeof slug !== 'string') return res.status(400).json({ error: 'Missing slug' });
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
  }

  await connectToDatabase();
  const client = (await Client.findOne({ slug }).lean()) as ClientDoc | null;
  if (!client) return res.status(404).json({ error: 'Not found' });

  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd = new Date(`${date}T23:59:59.999Z`);
  const bookings = await Booking.find({
    clientId: client._id,
    date: { $gte: dayStart, $lte: dayEnd },
    status: { $ne: 'Cancelled' },
  })
    .select('timeSlot')
    .lean();

  const countBySlot = new Map<string, number>();
  for (const b of bookings) {
    countBySlot.set(b.timeSlot, (countBySlot.get(b.timeSlot) ?? 0) + 1);
  }

  const capacity = client.capacityPerSlot ?? 2;
  const slots = TIME_SLOTS.map((time) => {
    const booked = countBySlot.get(time) ?? 0;
    return { time, available: booked < capacity };
  });

  return res.status(200).json({ slots });
}

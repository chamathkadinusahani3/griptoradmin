import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Client, ClientDoc } from '../../models/Client.js';
import { requireTenantPermission } from '../../auth.js';
import { computeSlotAvailability } from '../../bookingAvailability.js';

// Staff-facing equivalent of public/bookings/[slug]/availability.ts — same
// slot-availability computation (shared via bookingAvailability.ts) but
// session/clientId-scoped like every other staff route, instead of the
// public wizard's unauthenticated slug lookup. Powers the New Booking
// modal's live "2/3 booked" slot picker.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'bookings:view');
  if (!session) return;

  const { date, branchId } = req.query;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
  }

  await connectToDatabase();
  const client = (await Client.findById(session.clientId).lean()) as ClientDoc;

  const slots = await computeSlotAvailability(client, date, typeof branchId === 'string' ? branchId : undefined);
  return res.status(200).json({ slots });
}

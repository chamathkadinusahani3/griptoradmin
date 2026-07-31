import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../../db.js';
import { Booking, BookingDoc } from '../../../models/Booking.js';
import { Customer, CustomerDoc } from '../../../models/Customer.js';
import { Client, ClientDoc } from '../../../models/Client.js';
import { SmsLog } from '../../../models/SmsLog.js';
import { requireTenantPermission } from '../../../auth.js';
import { sendSms } from '../../../notifylk.js';
import { serializeBooking } from '../../../serializers.js';

interface LateAlertBody {
  minutesLate?: number;
}

const AUTO_CANCEL_THRESHOLD_MINUTES = 30;

// Called by the frontend's 60s late-booking poller (useLateAlerts) once a
// still-Pending booking crosses the 10-minute-late mark, and again at 30.
// Mirrors bookings/[id]/convert.ts's "dedicated sub-route for a side-effect
// action" convention rather than an `action`-dispatch field on the shared
// PATCH endpoint. No server-side dedup — the poller tracks which bookings
// it has already alerted-at-10/alerted-at-30 for the session, matching the
// "dismissible" (ephemeral, not persisted) framing of the alert banner.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'bookings:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing booking id' });

  const { minutesLate } = (req.body ?? {}) as LateAlertBody;
  if (typeof minutesLate !== 'number' || minutesLate < 0) {
    return res.status(400).json({ error: 'minutesLate must be a non-negative number' });
  }

  await connectToDatabase();

  const booking = (await Booking.findOne({ _id: id, clientId: session.clientId }).lean()) as BookingDoc | null;
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  if (booking.status !== 'Pending') {
    return res.status(400).json({ error: `Booking is "${booking.status}", not Pending — nothing to alert on` });
  }

  const customer = (await Customer.findById(booking.customerId).lean()) as CustomerDoc | null;
  const client = (await Client.findById(session.clientId).lean()) as ClientDoc;

  let smsResult: { sent: boolean; error?: string } | undefined;
  if (customer?.phone) {
    const message =
      minutesLate >= AUTO_CANCEL_THRESHOLD_MINUTES
        ? `Hi ${customer.name}, your ${booking.timeSlot} booking at ${client.name} has been cancelled as you haven't arrived. Please rebook if you'd still like to come in.`
        : `Hi ${customer.name}, we're still expecting you for your ${booking.timeSlot} booking at ${client.name}. Please let us know if you're on your way.`;
    smsResult = await sendSms(client, customer.phone, message);
    await SmsLog.create({
      clientId: session.clientId,
      customerId: customer._id,
      to: customer.phone,
      message,
      sent: smsResult.sent,
      error: smsResult.error,
      source: 'late-alert',
    });
  }

  let updated = booking;
  if (minutesLate >= AUTO_CANCEL_THRESHOLD_MINUTES) {
    updated = (await Booking.findOneAndUpdate(
      { _id: id, clientId: session.clientId },
      { $set: { status: 'Cancelled' } },
      { returnDocument: 'after' }
    ).lean()) as BookingDoc;
  }

  return res.status(200).json({
    booking: serializeBooking(updated, customer?.name),
    smsSent: smsResult?.sent ?? false,
    smsError: smsResult?.error,
  });
}

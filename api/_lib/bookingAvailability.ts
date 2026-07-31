import { ClientDoc } from './models/Client.js';
import { Branch, BranchDoc } from './models/Branch.js';
import { Booking } from './models/Booking.js';
import { TIME_SLOTS } from './bookingSlots.js';

export interface SlotAvailability {
  time: string;
  booked: number;
  capacity: number;
  available: boolean;
}

/**
 * Shared by the public wizard's availability endpoint (public/bookings/[slug]/availability.ts,
 * slug-scoped, unauthenticated) and the staff-facing equivalent (bookings/availability.ts,
 * session-scoped) so the counting logic can't drift between the two callers.
 */
export async function computeSlotAvailability(
  client: ClientDoc,
  date: string,
  branchId?: string
): Promise<SlotAvailability[]> {
  const branch = branchId ? ((await Branch.findOne({ _id: branchId, clientId: client._id }).lean()) as BranchDoc | null) : null;

  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd = new Date(`${date}T23:59:59.999Z`);
  const bookingFilter: Record<string, unknown> = {
    clientId: client._id,
    date: { $gte: dayStart, $lte: dayEnd },
    status: { $ne: 'Cancelled' },
  };
  if (branch) bookingFilter.branchId = branch._id;

  const bookings = await Booking.find(bookingFilter).select('timeSlot').lean();

  const countBySlot = new Map<string, number>();
  for (const b of bookings) {
    countBySlot.set(b.timeSlot, (countBySlot.get(b.timeSlot) ?? 0) + 1);
  }

  const capacity = branch ? branch.capacityPerSlot ?? client.capacityPerSlot ?? 2 : client.capacityPerSlot ?? 2;
  return TIME_SLOTS.map((time) => {
    const booked = countBySlot.get(time) ?? 0;
    return { time, booked, capacity, available: booked < capacity };
  });
}

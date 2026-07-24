import mongoose from 'mongoose';
import { Client } from './models/Client';
import { Booking, BookingDoc } from './models/Booking';

interface CreateBookingInput {
  clientId: string;
  customerId: string;
  serviceIds: string[];
  vehicle: string;
  plate?: string;
  date: Date;
  timeSlot: string;
  notes?: string;
  source: 'public' | 'staff';
  // Optional — stored for reporting/filtering when the tenant has
  // gms-multi. Slot capacity stays tenant-wide, not split per branch, in
  // this phase (a reasonable simplification, not promised otherwise).
  branchId?: string;
}

/**
 * Creates a booking with a real, transaction-enforced capacity check — unlike
 * the Anura reference, where the availability endpoint's counts are advisory
 * only and never re-checked at write time. Same "count inside the
 * transaction, reject if full" pattern as api/sales/index.ts's stock check.
 * Throws an Error with a `.statusCode` property on validation/capacity
 * failure — callers should catch and respond with that status.
 */
export async function createBookingWithCapacityCheck(input: CreateBookingInput): Promise<BookingDoc> {
  const dbSession = await mongoose.startSession();
  try {
    let created: BookingDoc | undefined;
    await dbSession.withTransaction(async () => {
      const client = await Client.findById(input.clientId).session(dbSession);
      if (!client) {
        throw Object.assign(new Error('Unknown garage'), { statusCode: 404 });
      }

      const existingCount = await Booking.countDocuments({
        clientId: input.clientId,
        date: input.date,
        timeSlot: input.timeSlot,
        status: { $ne: 'Cancelled' },
      }).session(dbSession);

      const capacity = client.capacityPerSlot ?? 2;
      if (existingCount >= capacity) {
        throw Object.assign(new Error('This time slot is fully booked'), { statusCode: 400 });
      }

      const [booking] = await Booking.create(
        [
          {
            clientId: input.clientId,
            customerId: input.customerId,
            serviceIds: input.serviceIds,
            vehicle: input.vehicle,
            plate: input.plate,
            date: input.date,
            timeSlot: input.timeSlot,
            notes: input.notes,
            source: input.source,
            branchId: input.branchId,
          },
        ],
        { session: dbSession }
      );
      created = booking.toObject() as BookingDoc;
    });

    return created!;
  } finally {
    await dbSession.endSession();
  }
}

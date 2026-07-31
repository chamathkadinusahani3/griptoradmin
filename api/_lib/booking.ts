import mongoose from 'mongoose';
import { Client } from './models/Client.js';
import { Branch, BranchDoc } from './models/Branch.js';
import { Service, ServiceDoc } from './models/Service.js';
import { Booking, BookingDoc } from './models/Booking.js';

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
  branchId?: string;
  bayId?: string;
}

/**
 * Creates a booking with a real, transaction-enforced capacity check — unlike
 * the Anura reference, where the availability endpoint's counts are advisory
 * only and never re-checked at write time. Same "count inside the
 * transaction, reject if full" pattern as api/sales/index.ts's stock check.
 * Throws an Error with a `.statusCode` property on validation/capacity
 * failure — callers should catch and respond with that status.
 *
 * When a branchId is given, capacity is scoped to that branch (falling back
 * to the branch's own capacityPerSlot, then the tenant-wide default) and
 * every requested service must be in that branch's serviceCategories
 * (skipped entirely for a full-service branch, i.e. no categories set).
 * With no branchId, behavior is unchanged from before this check existed —
 * tenant-wide capacity, no category restriction.
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

      const branch = input.branchId
        ? ((await Branch.findById(input.branchId).session(dbSession)) as BranchDoc | null)
        : null;

      if (branch?.serviceCategories && branch.serviceCategories.length > 0) {
        const services = (await Service.find({ _id: { $in: input.serviceIds } })
          .session(dbSession)
          .lean()) as ServiceDoc[];
        const disallowed = services.find((s) => s.category && !branch.serviceCategories!.includes(s.category));
        if (disallowed) {
          throw Object.assign(new Error(`${branch.name} doesn't offer ${disallowed.category}`), { statusCode: 400 });
        }
      }

      const capacityFilter: Record<string, unknown> = {
        clientId: input.clientId,
        date: input.date,
        timeSlot: input.timeSlot,
        status: { $ne: 'Cancelled' },
      };
      if (branch) capacityFilter.branchId = branch._id;

      const existingCount = await Booking.countDocuments(capacityFilter).session(dbSession);

      const capacity = branch ? branch.capacityPerSlot ?? client.capacityPerSlot ?? 2 : client.capacityPerSlot ?? 2;
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
            bayId: input.bayId,
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

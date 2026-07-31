import mongoose, { Schema, InferSchemaType } from 'mongoose';

const BookingSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    serviceIds: { type: [Schema.Types.ObjectId], ref: 'Service', required: true },
    vehicle: { type: String, required: true },
    plate: { type: String },
    date: { type: Date, required: true },
    timeSlot: { type: String, required: true },
    // 'Confirmed' retired in favor of 'Waiting'/'In Progress' (see the
    // one-time migration script run alongside this change) — every
    // pre-existing 'Confirmed' document was backfilled to 'Waiting' before
    // this enum was tightened, so no document in Mongo ever holds a value
    // outside this list.
    status: { type: String, enum: ['Pending', 'Waiting', 'In Progress', 'Completed', 'Cancelled'], default: 'Pending' },
    notes: { type: String },
    source: { type: String, enum: ['public', 'staff'], default: 'staff' },
    jobCardId: { type: Schema.Types.ObjectId, ref: 'JobCard' },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
    bayId: { type: Schema.Types.ObjectId, ref: 'Bay' },
  },
  { timestamps: true }
);

// The hot path for capacity checks (createBookingWithCapacityCheck) filters
// on exactly this triple — previously unindexed.
BookingSchema.index({ clientId: 1, date: 1, timeSlot: 1 });

export type BookingDoc = InferSchemaType<typeof BookingSchema> & { _id: mongoose.Types.ObjectId };

export const Booking = mongoose.models.Booking || mongoose.model('Booking', BookingSchema);

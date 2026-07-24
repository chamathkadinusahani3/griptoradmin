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
    status: { type: String, enum: ['Pending', 'Confirmed', 'Completed', 'Cancelled'], default: 'Pending' },
    notes: { type: String },
    source: { type: String, enum: ['public', 'staff'], default: 'staff' },
    jobCardId: { type: Schema.Types.ObjectId, ref: 'JobCard' },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true }
);

export type BookingDoc = InferSchemaType<typeof BookingSchema> & { _id: mongoose.Types.ObjectId };

export const Booking = mongoose.models.Booking || mongoose.model('Booking', BookingSchema);

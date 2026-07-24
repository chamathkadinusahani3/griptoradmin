import mongoose, { Schema, InferSchemaType } from 'mongoose';

// First-class vehicle entity — replaces the free-text `Customer.vehicles`
// string array going forward (left in place for existing docs, just no
// longer written to). Owned by a Customer regardless of that customer's
// `type` — a fleet's vehicles and their owning customer's vehicles are the
// same records, so there's nothing that can drift between them.
const VehicleSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    label: { type: String, required: true },
    plate: { type: String },
    make: { type: String },
    model: { type: String },
    year: { type: Number },
    notes: { type: String },
  },
  { timestamps: true }
);

export type VehicleDoc = InferSchemaType<typeof VehicleSchema> & { _id: mongoose.Types.ObjectId };

export const Vehicle = mongoose.models.Vehicle || mongoose.model('Vehicle', VehicleSchema);

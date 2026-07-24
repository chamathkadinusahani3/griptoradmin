import mongoose, { Schema, InferSchemaType } from 'mongoose';

const ServiceSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    name: { type: String, required: true },
    category: { type: String },
    durationMinutes: { type: Number, default: 30 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export type ServiceDoc = InferSchemaType<typeof ServiceSchema> & { _id: mongoose.Types.ObjectId };

export const Service = mongoose.models.Service || mongoose.model('Service', ServiceSchema);

import mongoose, { Schema, InferSchemaType } from 'mongoose';

const JobOpeningSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    title: { type: String, required: true },
    description: { type: String },
    status: { type: String, enum: ['Open', 'Closed'], default: 'Open' },
  },
  { timestamps: true }
);

export type JobOpeningDoc = InferSchemaType<typeof JobOpeningSchema> & { _id: mongoose.Types.ObjectId };

export const JobOpening = mongoose.models.JobOpening || mongoose.model('JobOpening', JobOpeningSchema);

import mongoose, { Schema, InferSchemaType } from 'mongoose';

export const CANDIDATE_STATUSES = ['Applied', 'Interviewing', 'Offered', 'Hired', 'Rejected'] as const;

const CandidateSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    openingId: { type: Schema.Types.ObjectId, ref: 'JobOpening', required: true },
    name: { type: String, required: true },
    email: { type: String },
    phone: { type: String },
    status: { type: String, enum: CANDIDATE_STATUSES, default: 'Applied' },
    notes: { type: String },
  },
  { timestamps: true }
);

export type CandidateDoc = InferSchemaType<typeof CandidateSchema> & { _id: mongoose.Types.ObjectId };

export const Candidate = mongoose.models.Candidate || mongoose.model('Candidate', CandidateSchema);

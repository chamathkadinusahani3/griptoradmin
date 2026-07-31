import mongoose, { Schema, InferSchemaType } from 'mongoose';

export const LEAVE_TYPES = ['Annual', 'Sick', 'Unpaid', 'Other'] as const;

// Modeled directly on Approval.ts (same request/respond shape) — the one
// real difference is the extra 'Cancelled' status, letting a requester
// withdraw their own still-Pending request themselves.
const LeaveRequestSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    // Always session.sub server-side (api/_lib/routes/leave-requests/index.ts)
    // — never trusted from the client, same discipline as Approval.requestedBy.
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: LEAVE_TYPES, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    reason: { type: String },
    status: { type: String, enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'], default: 'Pending' },
    respondedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    respondedAt: { type: Date },
    responseNote: { type: String },
  },
  { timestamps: true }
);

export type LeaveRequestDoc = InferSchemaType<typeof LeaveRequestSchema> & { _id: mongoose.Types.ObjectId };

export const LeaveRequest = mongoose.models.LeaveRequest || mongoose.model('LeaveRequest', LeaveRequestSchema);

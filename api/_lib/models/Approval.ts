import mongoose, { Schema, InferSchemaType } from 'mongoose';

const APPROVAL_TYPES = ['Discount Authorization', 'Refund Request', 'Credit Limit Override', 'Warranty Claim', 'Other'] as const;

const ApprovalSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    type: { type: String, enum: APPROVAL_TYPES, required: true },
    subject: { type: String, required: true },
    amount: { type: Number },
    // Always taken from the authenticated session server-side
    // (api/approvals/index.ts, [id].ts) — never trusted from the client.
    // The direct fix for Anura's confirmed bug (respondedBy hardcoded to
    // the literal string 'Manager' regardless of who's logged in).
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
    respondedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    respondedAt: { type: Date },
    notes: { type: String },
  },
  { timestamps: true }
);

export type ApprovalDoc = InferSchemaType<typeof ApprovalSchema> & { _id: mongoose.Types.ObjectId };

export const Approval = mongoose.models.Approval || mongoose.model('Approval', ApprovalSchema);

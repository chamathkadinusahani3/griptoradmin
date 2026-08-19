import mongoose, { Schema, InferSchemaType } from 'mongoose';

// A real tracked entity for a specific part/job with actual warranty
// terms — Approval.ts's APPROVAL_TYPES has included a 'Warranty Claim'
// string since that model existed, but Approval is a one-shot generic
// yes/no request (subject/amount/notes) with no link to a part, job, or
// warranty period; Complaint.ts's own comment already flagged this as
// deliberately NOT a real tracked issue. This is that real entity.
const WarrantyClaimSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    claimNumber: { type: String, required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    jobCardId: { type: Schema.Types.ObjectId, ref: 'JobCard' },
    partId: { type: Schema.Types.ObjectId, ref: 'Part' },
    // Snapshot, same reasoning as every other subject/line-name snapshot in
    // this codebase — stays readable even if the Part is later renamed.
    partName: { type: String },
    issueDescription: { type: String, required: true },
    // The part/service's original provision date and the warranty length
    // promised on it — used to compute withinWarranty (serializers.ts) at
    // read time rather than storing a boolean that could go stale.
    providedDate: { type: Date },
    warrantyPeriodDays: { type: Number },
    status: { type: String, enum: ['Open', 'Approved', 'Rejected', 'Resolved'], default: 'Open' },
    resolution: { type: String },
    resolvedAt: { type: Date },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    notes: { type: String },
  },
  { timestamps: true }
);

export type WarrantyClaimDoc = InferSchemaType<typeof WarrantyClaimSchema> & { _id: mongoose.Types.ObjectId };

export const WarrantyClaim = mongoose.models.WarrantyClaim || mongoose.model('WarrantyClaim', WarrantyClaimSchema);

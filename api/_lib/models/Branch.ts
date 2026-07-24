import mongoose, { Schema, InferSchemaType } from 'mongoose';

// Real first-class entity — Anura's reference has no equivalent (branches
// there are a hardcoded name list duplicated across several files, never a
// database-backed collection). Gated behind the gms-multi add-on
// (api/branches/index.ts, [id].ts) — every branchId field elsewhere in the
// app is optional, so tenants without gms-multi are entirely unaffected.
const BranchSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    name: { type: String, required: true },
    address: { type: String },
    phone: { type: String },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export type BranchDoc = InferSchemaType<typeof BranchSchema> & { _id: mongoose.Types.ObjectId };

export const Branch = mongoose.models.Branch || mongoose.model('Branch', BranchSchema);

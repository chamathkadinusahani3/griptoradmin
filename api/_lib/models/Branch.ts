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
    // Undefined ⇒ falls back to Client.capacityPerSlot (createBookingWithCapacityCheck) —
    // every branch created before this field existed keeps today's tenant-wide behavior
    // with zero migration.
    capacityPerSlot: { type: Number },
    // Undefined/empty ⇒ full-service (offers every category present in the tenant's own
    // Service catalog). Non-empty ⇒ only these categories are bookable at this branch.
    // Categories are still just whatever free-text strings exist on Service.category —
    // no separate taxonomy/model.
    serviceCategories: { type: [String], default: undefined },
  },
  { timestamps: true }
);

export type BranchDoc = InferSchemaType<typeof BranchSchema> & { _id: mongoose.Types.ObjectId };

export const Branch = mongoose.models.Branch || mongoose.model('Branch', BranchSchema);

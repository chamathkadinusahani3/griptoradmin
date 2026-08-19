import mongoose, { Schema, InferSchemaType } from 'mongoose';

export const PROSPECT_SOURCES = ['Referral', 'Walk-in', 'Phone', 'Website', 'Social Media', 'Other'] as const;

// A garage's OWN prospective customers — deliberately named Prospect, not
// Lead, to avoid colliding with the existing Lead model (api/_lib/models/
// Lead.ts), which is a completely different, platform-level concept:
// prospective TENANT signups for Griptor itself (no clientId, viewed only
// by the super admin via leads/submit.ts + leads/index.ts). This model is
// the tenant-scoped one that was actually missing.
const ProspectSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    name: { type: String, required: true },
    phone: { type: String },
    email: { type: String },
    source: { type: String, enum: PROSPECT_SOURCES },
    status: { type: String, enum: ['New', 'Contacted', 'Qualified', 'Converted', 'Lost'], default: 'New' },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
    // Set once converted (prospects/[id]/convert.ts) — the real Customer
    // this prospect became, same "reference, don't duplicate" pattern as
    // Return.sourceId.
    convertedCustomerId: { type: Schema.Types.ObjectId, ref: 'Customer' },
    lostReason: { type: String },
    notes: { type: String },
  },
  { timestamps: true }
);

export type ProspectDoc = InferSchemaType<typeof ProspectSchema> & { _id: mongoose.Types.ObjectId };

export const Prospect = mongoose.models.Prospect || mongoose.model('Prospect', ProspectSchema);

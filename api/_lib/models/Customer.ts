import mongoose, { Schema, InferSchemaType } from 'mongoose';

const CustomerSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    name: { type: String, required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String },
    // Legacy free-text vehicle list — kept for existing documents, but no
    // longer written to. New vehicles are real `Vehicle` documents instead
    // (see api/_lib/models/Vehicle.ts).
    vehicles: { type: [String], default: [] },
    tags: { type: [String], default: [] },
    visits: { type: Number, default: 0 },
    lastVisit: { type: Date },
    loyaltyPoints: { type: Number, default: 0 },
    totalSpend: { type: Number, default: 0 },
    // Corporate/B2B fields — setting `type: 'corporate'` or a non-zero
    // creditLimit/discountPct requires the tenant's `gms-fleet` add-on
    // (enforced in api/customers/index.ts + [id].ts, not here).
    type: { type: String, enum: ['individual', 'corporate'], default: 'individual' },
    contactPerson: { type: String },
    creditLimit: { type: Number, default: 0 },
    discountPct: { type: Number, default: 0 },
    // Presence means this customer has self-service portal access — set
    // either by self-registration (api/public/portal/[slug]/register.ts) or
    // staff-issued activation (api/customers/[id]/portal-password.ts).
    // Never returned by any serializer — only a derived `hasPortalAccount`
    // boolean is.
    passwordHash: { type: String },
  },
  { timestamps: true }
);

export type CustomerDoc = InferSchemaType<typeof CustomerSchema> & { _id: mongoose.Types.ObjectId };

export const Customer = mongoose.models.Customer || mongoose.model('Customer', CustomerSchema);

import mongoose, { Schema, InferSchemaType } from 'mongoose';

// Kept in sync manually with BRAND_PALETTES' ids in src/data/brandPalettes.ts —
// can't import that file directly, same cross-boundary vercel-dev bundler
// issue documented in api/_lib/pricingCatalog.ts.
export const BRAND_PALETTE_IDS = [
  'blue',
  'yellow',
  'green',
  'pink',
  'purple',
  'orange',
  'black',
  'brown',
  'grey',
] as const;

const BrandingSchema = new Schema(
  {
    paletteId: { type: String, enum: BRAND_PALETTE_IDS, default: 'blue' },
    logoDataUrl: { type: String },
    defaultMode: { type: String, enum: ['light', 'dark'], default: 'light' },
  },
  { _id: false }
);

// Per-tenant SMS gateway credentials (notify.lk) — deliberately NOT a
// shared platform-wide env var like BLOB_READ_WRITE_TOKEN, since each
// garage brings its own notify.lk account. Never returned in full by any
// serializer (see serializeClient's hasSmsConfig).
const SmsConfigSchema = new Schema(
  {
    userId: { type: String },
    apiKey: { type: String },
    senderId: { type: String },
  },
  { _id: false }
);

const ClientSchema = new Schema(
  {
    name: { type: String, required: true },
    contact: { type: String, required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    plan: { type: String, enum: ['Starter', 'Professional', 'Enterprise'], required: true },
    status: { type: String, enum: ['Active', 'Trial', 'Suspended'], required: true },
    modules: { type: [String], default: [] },
    addOns: { type: [String], default: [] },
    // Core features are included by default with a module — this only ever
    // holds the ones a super admin has explicitly turned OFF for this one
    // client. Keyed "<moduleId>:<feature text>" since the same feature
    // wording can appear under more than one module (e.g. "Digital
    // Inspections" under both gms and vehicle-inspection).
    disabledCoreFeatures: { type: [String], default: [] },
    signupDate: { type: Date, default: Date.now },
    mrr: { type: Number, default: 0 },
    locations: { type: Number, default: 1 },
    staff: { type: Number, default: 1 },
    branding: { type: BrandingSchema, default: () => ({}) },
    // URL-friendly identifier for this tenant's public pages (e.g. /book/:slug).
    // Sparse so older clients created before this field existed don't all
    // collide on a shared `null` unique-index value.
    slug: { type: String, unique: true, sparse: true },
    // How many bookings can share the same time slot — a single number since
    // there's no multi-branch/location model yet (see Booking System roadmap).
    capacityPerSlot: { type: Number, default: 2 },
    smsConfig: { type: SmsConfigSchema },
  },
  { timestamps: true }
);

export type ClientDoc = InferSchemaType<typeof ClientSchema> & { _id: mongoose.Types.ObjectId };

export const Client = mongoose.models.Client || mongoose.model('Client', ClientSchema);

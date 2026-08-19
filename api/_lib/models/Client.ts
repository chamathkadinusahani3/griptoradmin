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
  // Sentinel, not a preset — 'custom' means the tenant picked their own
  // accentColor, which the frontend derives a full palette from at render
  // time (src/data/brandPalettes.ts's paletteFromAccent/resolveBrandPalette).
  'custom',
] as const;

const BrandingSchema = new Schema(
  {
    paletteId: { type: String, enum: BRAND_PALETTE_IDS, default: 'blue' },
    logoDataUrl: { type: String },
    defaultMode: { type: String, enum: ['light', 'dark'], default: 'light' },
    // Only meaningful when paletteId === 'custom' — a hex color the
    // frontend derives a full 5-shade palette from.
    accentColor: { type: String },
    sidebarStyle: { type: String, enum: ['expanded', 'compact'], default: 'expanded' },
    // No enum — the frontend only ever offers a curated list via its own
    // UI (src/data/brandPalettes.ts's FONT_OPTIONS), same reasoning as
    // logoDataUrl/contact not being enum-constrained here.
    fontFamily: { type: String, default: 'Inter' },
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

// Per-document-type invoice/PO/etc. number prefix — defaults match the
// literals every route hardcoded before this existed (api/_lib/numbering.ts's
// DEFAULT_NUMBERING_PREFIXES), so an unconfigured tenant sees byte-identical
// numbers to today. Empty/unset per-key falls back to that same default at
// generation time, not here — this sub-schema only stores an override.
const NumberingPrefixesSchema = new Schema(
  {
    invoice: { type: String },
    quotation: { type: String },
    purchaseOrder: { type: String },
    complaint: { type: String },
    expense: { type: String },
    return: { type: String },
    purchaseRequisition: { type: String },
    rfq: { type: String },
    supplierQuotation: { type: String },
    grn: { type: String },
    purchaseInvoice: { type: String },
    salesOrder: { type: String },
    deliveryNote: { type: String },
    salaryAdvance: { type: String },
    warrantyClaim: { type: String },
    supplierClaim: { type: String },
  },
  { _id: false }
);

const ClientSchema = new Schema(
  {
    name: { type: String, required: true },
    contact: { type: String, required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    // No longer a fixed enum — super admins can create new named plans from
    // the Subscriptions page (api/_lib/models/PricingTier.ts). Validity is
    // checked at the write boundary instead (api/clients/[id].ts,
    // api/clients/index.ts), against the live PricingTier collection.
    plan: { type: String, required: true },
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
    // Owner/Manager's own phone for automated internal alerts (low stock,
    // dealer-outstanding SMS batch summary) — separate from smsConfig (the
    // notify.lk gateway credentials themselves) and from any Customer's own
    // phone. `contact` above is a contact-PERSON name, not a phone number.
    // Optional; the cron simply skips + logs when unset.
    alertsPhone: { type: String },
    // stripeCustomerId/stripeSubscriptionId are leftover from the removed
    // Stripe-based tenant subscription billing (Stripe doesn't support Sri
    // Lankan merchants — replaced by PayHere). Unused/unset by anything.
    stripeCustomerId: { type: String },
    stripeSubscriptionId: { type: String },
    // trialEndsAt: real, actively used — the 14-day trial is fully
    // app-managed (api/tenants/register.ts sets it at signup, no gateway
    // involved at all until a real charge is actually needed).
    trialEndsAt: { type: Date },
    // Set once the tenant completes real PayHere recurring-payment
    // authorization for their plan (api/tenant/setup-payment.ts +
    // api/public/payhere-notify.ts's AUTHORIZATION_SUCCESS handling).
    // Switching plans (no OAuth cancel API yet — deferred) starts a NEW
    // subscription and overwrites this; the old one keeps charging until
    // manually cancelled in PayHere's dashboard, clearly warned in the UI.
    payhereSubscriptionId: { type: String },
    // --- Phase 2 (ERP Settings foundation) additions below ---
    // Company profile fields the original schema never had — Settings.tsx's
    // "Garage profile" card only ever exposed name/contact/email.
    address: { type: String },
    phone: { type: String },
    taxId: { type: String },
    website: { type: String },
    // Percentage (8 means 8%), not a fraction — matches how it's displayed
    // in Settings.tsx. Default matches the TAX_RATE=0.08 every route used
    // to hardcode (api/_lib/accounting.ts, routes/sales/index.ts,
    // POS.tsx) before this existed, so an unconfigured tenant computes
    // byte-identical totals to today.
    taxRatePct: { type: Number, default: 8 },
    // Storage only for now — PayHere and all pricing display remain
    // hardcoded to LKR (api/_lib/griptorPricingLkr.ts). Rewiring actual
    // money formatting/payment-gateway currency is out of scope here.
    currency: { type: String, default: 'LKR' },
    // 1 = January (calendar year, the default). Not yet consumed by any
    // report or payroll period calculation — those stay ad-hoc
    // from/to-date-picked as today; this just records the tenant's answer
    // for when that wiring happens.
    fiscalYearStartMonth: { type: Number, min: 1, max: 12, default: 1 },
    numberingPrefixes: { type: NumberingPrefixesSchema, default: () => ({}) },
  },
  { timestamps: true }
);

export type ClientDoc = InferSchemaType<typeof ClientSchema> & { _id: mongoose.Types.ObjectId };

export const Client = mongoose.models.Client || mongoose.model('Client', ClientSchema);

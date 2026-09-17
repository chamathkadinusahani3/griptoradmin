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
    // Corporate/B2B fields — setting `type` to `corporate`/`wholesale`/
    // `dealer`, or a non-zero creditLimit/discountPct, requires the tenant's
    // `gms-fleet` add-on (enforced in api/_lib/routes/customers/index.ts +
    // [id].ts, not here). `individual`/`retail` stay ungated — both are
    // walk-in/end-consumer classifications with no credit terms attached.
    type: { type: String, enum: ['individual', 'corporate', 'retail', 'wholesale', 'dealer'], default: 'individual' },
    contactPerson: { type: String },
    creditLimit: { type: Number, default: 0 },
    discountPct: { type: Number, default: 0 },
    // Days after an invoice's issue date (createdAt) this dealer has to
    // settle it before being "in violation" (api/_lib/creditDiscipline.ts) —
    // same gms-fleet gating as creditLimit/discountPct above.
    creditPeriodDays: { type: Number, default: 30 },
    // Sales Module Phase 1 — generic B2B data entry, deliberately ungated
    // (unlike the credit fields above, these carry no credit/discount
    // implication on their own).
    billingAddress: { type: String },
    shippingAddress: { type: String },
    taxNumber: { type: String },
    // Business status — a Blocked customer is rejected at Quotation/
    // SalesOrder/CustomerInvoice creation (the three "start something new"
    // commercial entry points; POS Sale has no customer identity at all,
    // and actions on an EXISTING relationship — Receipt, Return, Advance
    // Payment — stay unaffected so a blocked customer's outstanding balance
    // can still be collected/reconciled). Ungated, same reasoning as above.
    status: { type: String, enum: ['Active', 'Inactive', 'Blocked'], default: 'Active' },
    // Sales Module Phase 6 — settable only while Client.priceListsEnabled is
    // on (enforced in api/_lib/routes/customers/index.ts + [id].ts, not
    // here, same gating shape as the gms-fleet corporate fields above).
    // Only ever consumed by SalesOrder creation — see PriceList.ts's own
    // comment for why the other 3 document types can't use this.
    defaultPriceListId: { type: Schema.Types.ObjectId, ref: 'PriceList' },
    // Presence means this customer has self-service portal access — set
    // either by self-registration (api/public/portal/[slug]/register.ts) or
    // staff-issued activation (api/customers/[id]/portal-password.ts).
    // Never returned by any serializer — only a derived `hasPortalAccount`
    // boolean is.
    passwordHash: { type: String },
    // Which module context this customer was created under (a MODULE_CATALOG
    // id, e.g. 'gms' vs 'crm' — both surface the same Customers page — or
    // 'booking-system' for the public booking auto-create). Unset for
    // customers created before this field existed or via customer-portal
    // self-registration, which isn't attributable to any one module. Powers
    // the "which module did this customer come from" filter on the tenant
    // Customers page — not enforced/validated beyond api/_lib/moduleCatalog.ts
    // membership at the write boundary.
    sourceModule: { type: String },
  },
  { timestamps: true }
);

export type CustomerDoc = InferSchemaType<typeof CustomerSchema> & { _id: mongoose.Types.ObjectId };

export const Customer = mongoose.models.Customer || mongoose.model('Customer', CustomerSchema);

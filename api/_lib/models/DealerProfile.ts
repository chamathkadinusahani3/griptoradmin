import mongoose, { Schema, InferSchemaType } from 'mongoose';
import { AttachmentSchema } from './attachmentSchema.js';

export const BUSINESS_TYPES = ['Sole Proprietorship', 'Partnership', 'Private Limited', 'Public Limited', 'Other'] as const;
export const DEALER_CATEGORIES = ['Retailer', 'Wholesaler', 'Distributor', 'Tyre Shop', 'Garage', 'Fleet', 'Other'] as const;
export const OWNER_ROLES = ['Owner', 'Director', 'Partner'] as const;
export const SIGNATORY_TYPES = ['Single', 'Joint'] as const;
export const PAYMENT_TYPES = ['Cash', 'Credit', 'Bank Transfer', 'Cheque'] as const;
export const CUSTOMER_SEGMENTS = ['Passenger', 'SUV', 'Truck', 'Bus', 'Commercial', 'Mixed'] as const;
// Phase 4 — the credit-approval workflow. Deliberately a flat top-level
// `status` field (not nested), so the shared respondToApprovalGate()
// helper (api/_lib/approvalGate.ts) — which hardcodes the field name
// `status` — works here unmodified, exactly like every other approval gate
// in this codebase, just called once per adjacent pair in this sequence
// instead of a single Pending->Approved/Rejected jump. No schema-level
// `default` on purpose: a DealerProfile created before this field existed
// (Phases 1-3) stores no `status` at all, reads back as `undefined`, and
// dealer-approval-gating code treats that as "grandfathered, already
// transactable" rather than suddenly blocking a pre-existing dealer — only
// customers/index.ts and [id].ts's NEW-profile-creation paths explicitly
// set 'New Dealer' going forward. 'Rejected' is a terminal reachable from
// any state before 'Activated', not a step in the forward sequence itself.
export const DEALER_APPROVAL_STATUSES = [
  'New Dealer',
  'Credit Application',
  'Documents Verified',
  'Credit Review',
  'Manager Approval',
  'Finance Approval',
  'Activated',
  'Rejected',
] as const;
export const DEALER_DOCUMENT_TYPES = [
  'Business Registration Certificate',
  'TIN Certificate',
  'VAT Certificate',
  'Owner NIC/Passport',
  'Proof of Business Address',
  'Bank Statement',
  'Bank Confirmation',
  'Authorized Signatory Document',
  'Credit Application',
  'Dealer Agreement',
  'Other',
] as const;

const MainContactSchema = new Schema(
  {
    person: { type: String },
    designation: { type: String },
    mobile: { type: String },
    landline: { type: String },
    email: { type: String },
    whatsapp: { type: String },
    website: { type: String },
  },
  { _id: false }
);

// Accounts and Purchasing contacts are deliberately separate from the main
// contact — invoices/payments/statements often need to reach a different
// person than day-to-day business communication, and B2B customer systems
// commonly distinguish purchasing from accounts-payable contacts. Same
// small shape reused for both since neither needs more than name/phone/email.
const SecondaryContactSchema = new Schema(
  {
    name: { type: String },
    phone: { type: String },
    email: { type: String },
  },
  { _id: false }
);

const RegisteredAddressSchema = new Schema(
  {
    line1: { type: String },
    line2: { type: String },
    city: { type: String },
    district: { type: String },
    province: { type: String },
    postalCode: { type: String },
  },
  { _id: false }
);

// businessAddress/billingAddress/deliveryAddress all carry a "same as"
// flag — the frontend uses it to drive a checkbox that copies the parent
// address forward, but the flag itself is what's persisted so the UI can
// reproduce the checked state on re-edit rather than re-diffing addresses
// to guess whether they were ever "the same".
const BusinessAddressSchema = new Schema(
  {
    sameAsRegistered: { type: Boolean, default: true },
    line1: { type: String },
    city: { type: String },
    district: { type: String },
  },
  { _id: false }
);

const DerivedAddressSchema = new Schema(
  {
    sameAsBusiness: { type: Boolean, default: true },
    address: { type: String },
  },
  { _id: false }
);

// Phase 2 — Owners/Directors/Partners and Authorized Signatories. Both are
// repeatable, embedded directly on DealerProfile (matching this codebase's
// own convention of embedding sub-record arrays — e.g. SalesOrder.items —
// rather than a new top-level collection only ever queried in the context
// of one dealer). Whole-array replace on edit (same convention Quotation
// line-items use), so `_id: false` — no per-item CRUD needed.
const OwnerSchema = new Schema(
  {
    name: { type: String, required: true },
    nicOrPassport: { type: String },
    designation: { type: String },
    mobile: { type: String },
    email: { type: String },
    address: { type: String },
    role: { type: String, enum: OWNER_ROLES, default: 'Owner' },
  },
  { _id: false }
);

// signatureUrl is populated via the same Vercel Blob attachment mechanism
// Phase 3's Documents step adds — left as a plain optional URL string here
// so this schema doesn't need to change once that upload path exists.
const SignatorySchema = new Schema(
  {
    name: { type: String, required: true },
    designation: { type: String },
    nic: { type: String },
    mobile: { type: String },
    signatureUrl: { type: String },
    signatureType: { type: String, enum: SIGNATORY_TYPES, default: 'Single' },
    active: { type: Boolean, default: true },
  },
  { _id: false }
);

// A dealer's OWN bank details for verification/reconciliation — deliberately
// separate from the existing `BankAccount` model, which is exclusively the
// TENANT's own accounts and has no customer/dealer linkage at all.
const DealerBankAccountSchema = new Schema(
  {
    bankName: { type: String, required: true },
    branch: { type: String },
    accountName: { type: String },
    accountNumber: { type: String },
    accountType: { type: String },
    bankCode: { type: String },
  },
  { _id: false }
);

// Phase 3 — industry-specific business profile, flat (not repeatable), and
// a typed-slot document list (one attachment per documentType, replacing
// the same slot on re-upload) — distinct from the flat undifferentiated
// `attachments` array Quotation/SalesOrder/CustomerInvoice/Return use, since
// a credit application specifically needs to know WHICH required document
// is present vs. still missing.
const BusinessProfileSchema = new Schema(
  {
    numberOutlets: { type: Number },
    numberEmployees: { type: Number },
    numberSalesStaff: { type: Number },
    numberVehicles: { type: Number },
    approxMonthlyPurchase: { type: Number },
    approxAnnualPurchase: { type: Number },
    brandsSelling: { type: [String], default: [] },
    competitorBrands: { type: [String], default: [] },
    mainTyreSizes: { type: [String], default: [] },
    customerSegment: { type: String, enum: CUSTOMER_SEGMENTS },
  },
  { _id: false }
);

const DealerDocumentSchema = new Schema(
  {
    documentType: { type: String, enum: DEALER_DOCUMENT_TYPES, required: true },
    attachment: { type: AttachmentSchema, required: true },
  },
  { _id: false }
);

// Customer/Dealer Registration roadmap Phase 1 — the rich B2B dealer
// profile. Deliberately its OWN collection, 1:1 linked to Customer via
// customerId (never embedded on Customer itself) — per the user's own
// explicit instruction not to put everything into one Dealer table, and so
// every other existing reader of Customer (Quotation/SalesOrder/
// CustomerInvoice creation, dealerMetrics, corporate-summary, the
// Customers list) is completely unaffected by this model's existence.
// Customer stays the source of truth for name/email/phone/taxNumber/
// billingAddress/shippingAddress/creditLimit/discountPct/creditPeriodDays/
// status — none of those are duplicated here.
const DealerProfileSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, unique: true },
    dealerCode: { type: String, required: true },
    legalBusinessName: { type: String },
    tradingName: { type: String },
    businessRegistrationNo: { type: String },
    businessType: { type: String, enum: BUSINESS_TYPES },
    yearEstablished: { type: Number },
    dealerCategory: { type: String, enum: DEALER_CATEGORIES },

    mainContact: { type: MainContactSchema, default: () => ({}) },
    accountsContact: { type: SecondaryContactSchema, default: () => ({}) },
    purchasingContact: { type: SecondaryContactSchema, default: () => ({}) },

    registeredAddress: { type: RegisteredAddressSchema, default: () => ({}) },
    businessAddress: { type: BusinessAddressSchema, default: () => ({}) },
    billingAddress: { type: DerivedAddressSchema, default: () => ({}) },
    deliveryAddress: { type: DerivedAddressSchema, default: () => ({}) },

    tin: { type: String },
    vatRegistered: { type: Boolean, default: false },
    vatNumber: { type: String },
    svatNumber: { type: String },
    taxType: { type: String },
    taxExemptionStatus: { type: String },

    // Phase 2 — Owners/Directors, Authorized Signatories, Sales/Territory
    // (only the genuinely new fields — Sales Rep/Route/Territory itself
    // stay on SalespersonAssignment, not duplicated here), Commercial
    // payment type, and the dealer's own bank accounts.
    owners: { type: [OwnerSchema], default: [] },
    signatories: { type: [SignatorySchema], default: [] },
    region: { type: String },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
    dealerClass: { type: String },
    dealerGroup: { type: String },
    paymentType: { type: String, enum: PAYMENT_TYPES },
    dealerBankAccounts: { type: [DealerBankAccountSchema], default: [] },

    // Phase 3 — Business Profile and typed-slot Documents. Performance
    // metrics (Total Sales, Credit Utilization %, etc.) are deliberately NOT
    // stored here at all — they're computed live from transaction data by
    // dealerMetrics.ts and the new dealer-performance route, per the user's
    // own explicit "don't make these manually entered... calculate them"
    // instruction.
    businessProfile: { type: BusinessProfileSchema, default: () => ({}) },
    documents: { type: [DealerDocumentSchema], default: [] },

    // Phase 4 — Credit Approval workflow. See DEALER_APPROVAL_STATUSES's own
    // comment for why `status` has no schema default.
    status: { type: String, enum: DEALER_APPROVAL_STATUSES },
    requestedCreditLimit: { type: Number },
    recommendedCreditLimit: { type: Number },
    approvedCreditLimit: { type: Number },
    creditTerms: { type: String },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    reviewDate: { type: Date },
    rejectionReason: { type: String },
  },
  { timestamps: true }
);

export type DealerProfileDoc = InferSchemaType<typeof DealerProfileSchema> & { _id: mongoose.Types.ObjectId };

export const DealerProfile = mongoose.models.DealerProfile || mongoose.model('DealerProfile', DealerProfileSchema);

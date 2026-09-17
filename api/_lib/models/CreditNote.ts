import mongoose, { Schema, InferSchemaType } from 'mongoose';

export const CREDIT_NOTE_STATUSES = ['Open', 'Fully Applied', 'Void'] as const;

// ERP-Phase 5 — a formal paper trail on top of a customer-direction Return,
// auto-created alongside it (routes/returns/index.ts), never entered
// directly. Deliberately does NOT post its own GL entry — Return.ts already
// posts one (sourceType:'return-refund') whenever a refund was actually
// paid; this is documentation of the credit, not a second financial event.
//
// No customerId: the underlying chain (Return -> Sale, the only source type
// a customer-direction Return can have) has no customer identity at all —
// POS Sale is walk-in/anonymous by design (see Sale.ts). A Credit Note here
// is a paper credit tied to the Return itself, not a system-tracked
// per-customer balance — stated explicitly rather than fabricating a
// customer link the data can't actually support.
const CreditNoteSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    creditNoteNumber: { type: String, required: true },
    returnId: { type: Schema.Types.ObjectId, ref: 'Return', required: true },
    // Snapshotted from Return.totalAmount at creation — the value of goods
    // returned, independent of whether cash was refunded immediately.
    amount: { type: Number, required: true },
    // Seeded from Return.refundAmount if one was paid at return time (that
    // portion of the credit is already settled); 0 otherwise. Only Phase 11
    // (Utilization) grows this further, for the still-unbuilt "apply this
    // credit against a future invoice" flow.
    appliedAmount: { type: Number, default: 0 },
    remainingAmount: { type: Number, required: true },
    status: { type: String, enum: CREDIT_NOTE_STATUSES, default: 'Open' },
    reason: { type: String },
    notes: { type: String },
    voidedAt: { type: Date },
    voidReason: { type: String },
  },
  { timestamps: true }
);

export type CreditNoteDoc = InferSchemaType<typeof CreditNoteSchema> & { _id: mongoose.Types.ObjectId };

export const CreditNote = mongoose.models.CreditNote || mongoose.model('CreditNote', CreditNoteSchema);

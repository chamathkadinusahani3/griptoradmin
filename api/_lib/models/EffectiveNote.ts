import mongoose, { Schema, InferSchemaType } from 'mongoose';

export const EFFECTIVE_NOTE_STATUSES = ['Open', 'Fully Applied', 'Void'] as const;

// Dealer Credit Control roadmap Module 2 — per the user, this covers a
// specific tyre-distribution scenario: a customer files a warranty claim on
// a defective tyre (WarrantyClaim.ts), but the manufacturer/supplier only
// approves/reimburses PART of what was claimed (an "underclaim"). Rather
// than the customer eating that shortfall, it's captured here as a credit
// they can apply to a future invoice — same shape as CreditNote (Open /
// Fully Applied / Void, appliedAmount/remainingAmount), plugged into the
// same Utilization flow as a new sourceType.
//
// Deliberately its OWN model, not a field bolted onto WarrantyClaim: that
// model has no monetary fields at all today, and (like CustomerDebitNote's
// own reasoning for staying separate from DebitNote) this is a manually
// entered financial document with its own lifecycle, not a side effect of
// a status change. warrantyClaimId is optional — a garage might raise one
// even without a formally tracked WarrantyClaim ticket.
//
// No GL posting at creation — same "no natural account to net a non-cash
// credit against" reasoning as CreditNote.ts. Real cash only ever moves
// later, when Utilization applies this note against an invoice (which
// itself posts no entry either, per Utilization.ts's own comment).
const EffectiveNoteSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    effectiveNoteNumber: { type: String, required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    warrantyClaimId: { type: Schema.Types.ObjectId, ref: 'WarrantyClaim' },
    claimedAmount: { type: Number, required: true },
    approvedAmount: { type: Number, required: true },
    // Always server-computed as claimedAmount - approvedAmount — the
    // underclaimed shortfall, and the actual credit value this note grants.
    amount: { type: Number, required: true },
    appliedAmount: { type: Number, default: 0 },
    remainingAmount: { type: Number, required: true },
    status: { type: String, enum: EFFECTIVE_NOTE_STATUSES, default: 'Open' },
    reason: { type: String, required: true },
    notes: { type: String },
    voidedAt: { type: Date },
    voidReason: { type: String },
  },
  { timestamps: true }
);

export type EffectiveNoteDoc = InferSchemaType<typeof EffectiveNoteSchema> & { _id: mongoose.Types.ObjectId };

export const EffectiveNote = mongoose.models.EffectiveNote || mongoose.model('EffectiveNote', EffectiveNoteSchema);

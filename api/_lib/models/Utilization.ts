import mongoose, { Schema, InferSchemaType } from 'mongoose';

export const UTILIZATION_SOURCE_TYPES = ['creditNote', 'debitNote', 'advancePayment', 'receipt', 'effectiveNote'] as const;
export const UTILIZATION_TARGET_TYPES = ['invoice', 'return'] as const;

// ERP-Phase 11 (last phase of this roadmap) — applies an existing unapplied
// credit (CreditNote/DebitNote/AdvancePayment's remainingAmount, or a
// Receipt's unallocated onAccountAmount) against an outstanding balance
// (a CustomerInvoice/PurchaseOrder, resolved from the source's direction —
// see routes/utilizations/index.ts — or a Return's own unrefunded
// totalAmount - refundAmount). "targetType: invoice" is direction-resolved
// at apply time rather than split into separate customerInvoice/
// purchaseOrder values, since the source itself already carries direction.
//
// Deliberately posts NO journal entry: every source type's cash-equivalent
// value was already given its one and only GL treatment at the source's own
// creation time (AdvancePayment/Receipt's on-account portion posted a real
// Dr Cash/Cr Accounts Receivable-or-Payable entry for the FULL amount
// up front; CreditNote/DebitNote's remainingAmount, by contrast, was NEVER
// posted anywhere — same "no natural account to net a non-cash credit
// against" reasoning ERP-Phase 6's Settlement Discount already established
// for this app's simplified cash-basis GL). Utilization only ever
// re-attributes value between two already-existing documents; it never
// creates new value, so there's nothing new to post.
//
// Scoped conservatively for this first cut per the approved plan:
// single-source-to-single-target, full-or-partial amount, append-only (no
// reversal/undo) — same discipline as Return.ts/CollectionRecord. Multi-
// target splitting and reversal are an explicit fast-follow, not this phase.
const UtilizationSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    utilizationNumber: { type: String, required: true },
    sourceType: { type: String, enum: UTILIZATION_SOURCE_TYPES, required: true },
    sourceId: { type: Schema.Types.ObjectId, required: true },
    targetType: { type: String, enum: UTILIZATION_TARGET_TYPES, required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
    amount: { type: Number, required: true },
    date: { type: Date, required: true },
    notes: { type: String },
  },
  { timestamps: true }
);

export type UtilizationDoc = InferSchemaType<typeof UtilizationSchema> & { _id: mongoose.Types.ObjectId };

export const Utilization = mongoose.models.Utilization || mongoose.model('Utilization', UtilizationSchema);

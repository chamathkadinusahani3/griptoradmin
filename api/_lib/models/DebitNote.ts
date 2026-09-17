import mongoose, { Schema, InferSchemaType } from 'mongoose';

export const DEBIT_NOTE_STATUSES = ['Pending', 'Confirmed', 'Void'] as const;

// ERP-Phase 6 — the supplier-direction mirror of CreditNote.ts, auto-created
// alongside a supplier-direction Return (routes/returns/index.ts), never
// entered directly. Unlike CreditNote, this needs an explicit "Confirm"
// step (the user's own naming: "Debit Note Confirm") before it's treated as
// finalized — starts 'Pending', uses the shared api/_lib/approvalGate.ts
// helper to transition to 'Confirmed' (setting approvedBy/approvedAt), no
// reject path (there's nothing to reject — void covers "this was wrong").
// Same "no GL posting of its own" discipline as CreditNote — Return.ts
// already posts the supplier-refund entry when one exists.
const DebitNoteSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    debitNoteNumber: { type: String, required: true },
    returnId: { type: Schema.Types.ObjectId, ref: 'Return', required: true },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },
    // Snapshotted from Return.totalAmount at creation — the value of goods
    // returned to the supplier, independent of whether a refund/credit was
    // received immediately.
    amount: { type: Number, required: true },
    // Seeded from Return.refundAmount if the supplier credited/refunded us
    // at return time.
    appliedAmount: { type: Number, default: 0 },
    remainingAmount: { type: Number, required: true },
    status: { type: String, enum: DEBIT_NOTE_STATUSES, default: 'Pending' },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    reason: { type: String },
    notes: { type: String },
    voidedAt: { type: Date },
    voidReason: { type: String },
  },
  { timestamps: true }
);

export type DebitNoteDoc = InferSchemaType<typeof DebitNoteSchema> & { _id: mongoose.Types.ObjectId };

export const DebitNote = mongoose.models.DebitNote || mongoose.model('DebitNote', DebitNoteSchema);

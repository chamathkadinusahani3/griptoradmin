import mongoose, { Schema, InferSchemaType } from 'mongoose';

export const CUSTOMER_DEBIT_NOTE_STATUSES = ['Pending', 'Confirmed', 'Void'] as const;

// Sales Module Phase 10 — the customer-direction counterpart to
// DebitNote.ts, but NOT a variant of that model: the existing DebitNote is
// exclusively the supplier-direction mirror of CreditNote.ts, always
// auto-created alongside a supplier-direction Return, never entered
// directly (see that model's own comment). This document is the opposite in
// every relevant way — manually raised against a CustomerInvoice (billing a
// customer extra after the fact: freight, a price correction, a
// found-after-the-fact charge), with no Return involved at all — so it gets
// its own standalone model rather than overloading DebitNote with a
// direction field the way Return.ts does.
//
// Same Pending -> Confirmed lifecycle shape as DebitNote (approvalGate.ts's
// respondToApprovalGate, no reject path), but a materially different effect
// on Confirm: DebitNote's Confirm is purely a status flip (the return
// already moved money/goods; nothing else needs to change). This one is a
// real billing event — confirming it increases the target CustomerInvoice's
// total/balance (see routes/customer-debit-notes/[id].ts), which is why
// creation always starts Pending rather than applying immediately: a
// mis-entered amount can be caught before it ever touches the invoice.
//
// Deliberate scope decision: void is only permitted while still Pending.
// Once Confirmed, the invoice has already been billed and this document is
// permanent — same "append-only, no reversal" discipline already
// established for Utilization/Return/CollectionRecord in this codebase.
// Reversing a Confirmed customer debit note would require un-billing an
// invoice a customer may have already been shown/paid against, which is a
// materially bigger (and riskier) feature than this first cut covers.
const CustomerDebitNoteSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    debitNoteNumber: { type: String, required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    customerInvoiceId: { type: Schema.Types.ObjectId, ref: 'CustomerInvoice', required: true },
    amount: { type: Number, required: true },
    // Required — unlike DebitNote (auto-created, self-explanatory from its
    // parent Return), a manually-raised charge always needs a stated reason.
    reason: { type: String, required: true },
    status: { type: String, enum: CUSTOMER_DEBIT_NOTE_STATUSES, default: 'Pending' },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    notes: { type: String },
    voidedAt: { type: Date },
    voidReason: { type: String },
  },
  { timestamps: true }
);

export type CustomerDebitNoteDoc = InferSchemaType<typeof CustomerDebitNoteSchema> & { _id: mongoose.Types.ObjectId };

export const CustomerDebitNote = mongoose.models.CustomerDebitNote || mongoose.model('CustomerDebitNote', CustomerDebitNoteSchema);

import mongoose, { Schema, InferSchemaType } from 'mongoose';

// ERP-Phase 10 — a physical custody transfer of already-collected cash
// between two staff members (e.g. a field collector handing today's takings
// to the cashier, or a cashier handing over to accounts) — distinct from
// CashSession, which is one person's own till open/close. The cash being
// handed over was already recorded as received at its original point of
// collection (a Sale, a CustomerInvoice payment, a CollectionRecord), so
// this document posts NO journal entry of its own — same "derive, don't
// double-record" reasoning CashSession's close.ts already uses for expected
// cash-in. It's a reconciliation/audit-trail record, not a new financial
// event. Deliberately no edit/void — an append-only log matching the
// discipline used elsewhere for money-movement documents.
const CashHandoverSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    cashHandoverNumber: { type: String, required: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
    handedOverBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    receivedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    date: { type: Date, required: true },
    notes: { type: String },
  },
  { timestamps: true }
);

export type CashHandoverDoc = InferSchemaType<typeof CashHandoverSchema> & { _id: mongoose.Types.ObjectId };

export const CashHandover = mongoose.models.CashHandover || mongoose.model('CashHandover', CashHandoverSchema);

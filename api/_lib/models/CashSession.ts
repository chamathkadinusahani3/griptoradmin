import mongoose, { Schema, InferSchemaType } from 'mongoose';

// A till/petty-cash session — open with a starting float, close by counting
// what's actually in the drawer. Expected cash-in/cash-out is DERIVED at
// close time from Sale/CustomerInvoice/Expense/PurchaseOrder records dated
// within the session window (same "derive, don't store" discipline as
// bank-transactions.ts and Supplier's live stats), not a separately logged
// ledger of every cash movement as it happens.
const CashSessionSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
    openedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    openingFloat: { type: Number, required: true },
    status: { type: String, enum: ['Open', 'Closed'], default: 'Open' },
    closedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    closedAt: { type: Date },
    // Snapshotted at close time — see cash-sessions/[id]/close.ts. Kept on
    // the document (not recomputed on every read) so a session's reported
    // numbers don't silently change if new backdated records show up later.
    expectedCashIn: { type: Number },
    expectedCashOut: { type: Number },
    expectedClosingAmount: { type: Number },
    closingCountedAmount: { type: Number },
    variance: { type: Number },
    notes: { type: String },
  },
  { timestamps: true }
);

export type CashSessionDoc = InferSchemaType<typeof CashSessionSchema> & { _id: mongoose.Types.ObjectId };

export const CashSession = mongoose.models.CashSession || mongoose.model('CashSession', CashSessionSchema);

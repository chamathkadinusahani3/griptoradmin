import mongoose, { Schema, InferSchemaType } from 'mongoose';

export const ADVANCE_PAYMENT_METHODS = ['Cash', 'Card', 'Bank Transfer', 'Cheque', 'Other'] as const;
export const ADVANCE_PAYMENT_STATUSES = ['Open', 'Fully Applied', 'Void'] as const;

// ERP-Phase 8 — money received from a customer, or paid to a supplier,
// BEFORE any invoice/PO exists to attribute it to. Held as an unapplied
// credit balance (amount/appliedAmount/remainingAmount, same shape as
// CreditNote/DebitNote) until Phase 11 (Utilization, not yet built) can
// apply it against a future invoice/PO, or until a future invoice/PO
// creation route is taught to reference it directly.
//
// Unlike Credit/Debit Notes, this represents REAL cash that already moved
// with no prior GL event to piggyback on — so this document posts its own
// entry (see routes/advance-payments/index.ts), reusing the exact
// "Accounts Receivable/Payable pushed negative to represent a credit
// balance" technique Receipt's on-account remainder already established for
// the customer side; the supplier side mirrors it through Accounts Payable
// (seeded in the default Chart of Accounts, never posted to anywhere else
// today). No Cheque-entity integration — same explicitly-deferred scope
// boundary Phase 3 drew around Return/CollectionRecord's cheque fields;
// chequeNumber here stays a plain string, a fast-follow if ever needed.
const AdvancePaymentSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    advancePaymentNumber: { type: String, required: true },
    direction: { type: String, enum: ['customer', 'supplier'], required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer' },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier' },
    amount: { type: Number, required: true },
    method: { type: String, enum: ADVANCE_PAYMENT_METHODS, required: true },
    chequeNumber: { type: String },
    bankAccountId: { type: Schema.Types.ObjectId, ref: 'BankAccount' },
    date: { type: Date, required: true },
    appliedAmount: { type: Number, default: 0 },
    remainingAmount: { type: Number, required: true },
    status: { type: String, enum: ADVANCE_PAYMENT_STATUSES, default: 'Open' },
    notes: { type: String },
    voidedAt: { type: Date },
    voidReason: { type: String },
  },
  { timestamps: true }
);

export type AdvancePaymentDoc = InferSchemaType<typeof AdvancePaymentSchema> & { _id: mongoose.Types.ObjectId };

export const AdvancePayment = mongoose.models.AdvancePayment || mongoose.model('AdvancePayment', AdvancePaymentSchema);

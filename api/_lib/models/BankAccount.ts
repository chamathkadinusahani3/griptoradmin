import mongoose, { Schema, InferSchemaType } from 'mongoose';

// A labeled reference for "which account did this cheque/transfer go
// through" — deliberately NOT a balance-tracking ledger (no running balance
// field, no transaction-count cache). The actual money movement already
// lives on CustomerInvoice.paymentHistory / PurchaseOrder.paymentHistory;
// this just gives those entries something human-readable to point at.
const BankAccountSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    bankName: { type: String, required: true },
    accountNumber: { type: String, required: true },
    accountHolderName: { type: String },
    branch: { type: String },
    notes: { type: String },
  },
  { timestamps: true }
);

export type BankAccountDoc = InferSchemaType<typeof BankAccountSchema> & { _id: mongoose.Types.ObjectId };

export const BankAccount = mongoose.models.BankAccount || mongoose.model('BankAccount', BankAccountSchema);

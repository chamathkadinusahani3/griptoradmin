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
    // Dealer Credit Control roadmap Module 6 — how many days a Card
    // payment takes to actually settle into THIS account, so the
    // settlement date on a Card payment can be dynamically calculated
    // per-bank rather than manually guessed. Configurable, not hard-coded
    // (same "tenant-editable, not a fixed constant" discipline as
    // deliveryLoadRules/fuelPricePerLiter elsewhere). Default 2 is a
    // reasonable placeholder, not a business-day-aware calculation.
    cardSettlementDays: { type: Number, default: 2 },
  },
  { timestamps: true }
);

export type BankAccountDoc = InferSchemaType<typeof BankAccountSchema> & { _id: mongoose.Types.ObjectId };

export const BankAccount = mongoose.models.BankAccount || mongoose.model('BankAccount', BankAccountSchema);

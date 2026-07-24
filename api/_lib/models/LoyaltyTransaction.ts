import mongoose, { Schema, InferSchemaType } from 'mongoose';

// A real ledger (same design Anura's crm_loyalty_tx validated) — Customer.loyaltyPoints
// is the live balance, this is the audit trail behind it.
const LoyaltyTransactionSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    points: { type: Number, required: true }, // signed: positive = earned, negative = redeemed
    reason: { type: String, required: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: 'CustomerInvoice' },
    rewardId: { type: Schema.Types.ObjectId, ref: 'LoyaltyReward' },
  },
  { timestamps: true }
);

export type LoyaltyTransactionDoc = InferSchemaType<typeof LoyaltyTransactionSchema> & { _id: mongoose.Types.ObjectId };

export const LoyaltyTransaction =
  mongoose.models.LoyaltyTransaction || mongoose.model('LoyaltyTransaction', LoyaltyTransactionSchema);

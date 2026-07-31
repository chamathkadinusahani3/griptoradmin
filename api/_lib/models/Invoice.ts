import mongoose, { Schema, InferSchemaType } from 'mongoose';

const InvoiceSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    plan: { type: String, required: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: ['Paid', 'Pending', 'Failed'], required: true },
    // Leftover from the removed Stripe-based tenant subscription billing.
    // Unused/unset by anything now — superseded by payherePaymentId below.
    stripeInvoiceId: { type: String },
    // Set for a real PayHere-driven invoice (api/public/payhere-notify.ts's
    // PLAN_ order handling). Doubles as the notify callback's idempotency
    // key, same role stripeInvoiceId used to play.
    payherePaymentId: { type: String },
  },
  { timestamps: true }
);

export type InvoiceDoc = InferSchemaType<typeof InvoiceSchema> & { _id: mongoose.Types.ObjectId };

export const Invoice = mongoose.models.Invoice || mongoose.model('Invoice', InvoiceSchema);

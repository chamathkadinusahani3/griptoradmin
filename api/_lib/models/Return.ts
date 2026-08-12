import mongoose, { Schema, InferSchemaType } from 'mongoose';

// Snapshotted at return time, same convention as Sale.items/PurchaseOrder.items
// — the return still reads correctly even if the Part is later renamed/deleted.
const ReturnLineSchema = new Schema(
  {
    partId: { type: Schema.Types.ObjectId, ref: 'Part', required: true },
    name: { type: String, required: true },
    quantity: { type: Number, required: true },
    unitPrice: { type: Number, required: true },
  },
  { _id: false }
);

// A single append-only record for both directions of "goods went back the
// other way" — a customer returning something they bought (POS Sale), or
// the garage returning something to a supplier (a Received PurchaseOrder).
// Deliberately does NOT touch PurchaseOrder.balance/paidAmount — that math
// is already real and tested (see purchaseOrderPayments.ts); a return is
// independent record-keeping, not a payment. Only Part.stock is reversed
// automatically (see routes/returns/index.ts's transaction).
const ReturnSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    direction: { type: String, enum: ['customer', 'supplier'], required: true },
    sourceType: { type: String, enum: ['sale', 'purchase-order'], required: true },
    sourceId: { type: Schema.Types.ObjectId, required: true },
    returnNumber: { type: String, required: true },
    items: { type: [ReturnLineSchema], default: [] },
    // Always server-computed from `items`.
    totalAmount: { type: Number, required: true },
    reason: { type: String, required: true },
    notes: { type: String },
    // Only set if money actually changed hands as a result of this return —
    // a refund handed to a customer, or a credit/refund received from a
    // supplier. Same shape as CustomerInvoice/PurchaseOrder's own payment
    // records so it can ride the same Transactions feed and reconciliation
    // flow (api/_lib/routes/tenant/bank-transactions.ts).
    refundAmount: { type: Number },
    refundMethod: { type: String, enum: ['Cash', 'Card', 'Bank Transfer', 'Cheque', 'Other'] },
    chequeNumber: { type: String },
    bankAccountId: { type: Schema.Types.ObjectId, ref: 'BankAccount' },
    refundDate: { type: Date },
    reconciled: { type: Boolean, default: false },
    reconciledAt: { type: Date },
  },
  { timestamps: true }
);

export type ReturnDoc = InferSchemaType<typeof ReturnSchema> & { _id: mongoose.Types.ObjectId };

export const Return = mongoose.models.Return || mongoose.model('Return', ReturnSchema);

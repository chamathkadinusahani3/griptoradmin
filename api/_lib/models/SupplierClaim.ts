import mongoose, { Schema, InferSchemaType } from 'mongoose';

export const SUPPLIER_CLAIM_REASONS = ['Defective Goods', 'Short Shipment', 'Pricing Discrepancy', 'Damaged in Transit', 'Other'] as const;
export const SETTLEMENT_METHODS = ['Cash', 'Bank Transfer', 'Store Credit', 'Applied to Future Order'] as const;

// A compensation/credit claim against a supplier — distinct from Return.ts
// (physically sending goods back) and Complaint.ts (a ticket with no money
// tracked): this is specifically about recovering money or credit for a
// problem with what was delivered, with its own amountClaimed vs
// amountSettled tracking.
const SupplierClaimSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    claimNumber: { type: String, required: true },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },
    purchaseOrderId: { type: Schema.Types.ObjectId, ref: 'PurchaseOrder' },
    reason: { type: String, enum: SUPPLIER_CLAIM_REASONS, required: true },
    description: { type: String, required: true },
    amountClaimed: { type: Number, required: true },
    amountSettled: { type: Number, default: 0 },
    settlementMethod: { type: String, enum: SETTLEMENT_METHODS },
    status: { type: String, enum: ['Open', 'Accepted', 'Rejected', 'Settled'], default: 'Open' },
    settledAt: { type: Date },
    notes: { type: String },
  },
  { timestamps: true }
);

export type SupplierClaimDoc = InferSchemaType<typeof SupplierClaimSchema> & { _id: mongoose.Types.ObjectId };

export const SupplierClaim = mongoose.models.SupplierClaim || mongoose.model('SupplierClaim', SupplierClaimSchema);

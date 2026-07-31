import mongoose, { Schema, InferSchemaType } from 'mongoose';

const PurchaseOrderLineSchema = new Schema(
  {
    partId: { type: Schema.Types.ObjectId, ref: 'Part', required: true },
    // Snapshotted at order time, same convention as JobCard.partsUsed — the
    // order still reads correctly even if the Part is later renamed/deleted.
    name: { type: String, required: true },
    quantity: { type: Number, required: true },
    unitCost: { type: Number, required: true },
  },
  { _id: false }
);

const PurchaseOrderSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },
    poNumber: { type: String, required: true },
    items: { type: [PurchaseOrderLineSchema], default: [] },
    // Always server-computed from `items` — no tax here, this is an
    // internal cost record (what the garage pays a supplier), not a
    // customer-facing tax document like Quotation/CustomerInvoice.
    subtotal: { type: Number, required: true },
    total: { type: Number, required: true },
    status: { type: String, enum: ['Draft', 'Ordered', 'Received', 'Cancelled'], default: 'Draft' },
    expectedDate: { type: Date },
    receivedAt: { type: Date },
    notes: { type: String },
  },
  { timestamps: true }
);

export type PurchaseOrderDoc = InferSchemaType<typeof PurchaseOrderSchema> & { _id: mongoose.Types.ObjectId };

export const PurchaseOrder = mongoose.models.PurchaseOrder || mongoose.model('PurchaseOrder', PurchaseOrderSchema);

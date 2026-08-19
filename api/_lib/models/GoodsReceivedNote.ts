import mongoose, { Schema, InferSchemaType } from 'mongoose';

const GRNLineSchema = new Schema(
  {
    partId: { type: Schema.Types.ObjectId, ref: 'Part', required: true },
    name: { type: String, required: true },
    quantityReceived: { type: Number, required: true },
  },
  { _id: false }
);

// The real receiving record — created every time stock is checked in
// against a PurchaseOrder (purchase-orders/[id].ts's handleReceive), one
// per delivery. A single PO can now have more than one GRN against it
// (partial receiving across multiple shipments), where the old model only
// ever had a single receivedAt timestamp on the PO itself.
const GoodsReceivedNoteSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    grnNumber: { type: String, required: true },
    purchaseOrderId: { type: Schema.Types.ObjectId, ref: 'PurchaseOrder', required: true },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },
    items: { type: [GRNLineSchema], default: [] },
    notes: { type: String },
  },
  { timestamps: true }
);

export type GoodsReceivedNoteDoc = InferSchemaType<typeof GoodsReceivedNoteSchema> & { _id: mongoose.Types.ObjectId };

export const GoodsReceivedNote =
  mongoose.models.GoodsReceivedNote || mongoose.model('GoodsReceivedNote', GoodsReceivedNoteSchema);

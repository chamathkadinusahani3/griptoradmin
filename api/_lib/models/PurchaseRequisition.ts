import mongoose, { Schema, InferSchemaType } from 'mongoose';

// The internal "we want to buy this" request that starts the procurement
// pipeline, BEFORE any supplier is involved — Requisition -> RFQ -> Supplier
// Quotation -> (existing) PurchaseOrder. Deliberately no tax/discount
// fields, same internal-cost-record reasoning as PurchaseOrder.ts itself;
// estimatedUnitCost is a rough planning figure, not a real committed price.
const RequisitionLineSchema = new Schema(
  {
    partId: { type: Schema.Types.ObjectId, ref: 'Part' },
    name: { type: String, required: true },
    quantity: { type: Number, required: true },
    estimatedUnitCost: { type: Number },
  },
  { _id: false }
);

const PurchaseRequisitionSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    requisitionNumber: { type: String, required: true },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    items: { type: [RequisitionLineSchema], default: [] },
    // Always server-computed from `items` — sum of quantity * estimatedUnitCost
    // for lines that have one set (an estimate, not a real commitment).
    estimatedTotal: { type: Number, default: 0 },
    status: { type: String, enum: ['Pending', 'Approved', 'Rejected', 'Converted'], default: 'Pending' },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    rejectionReason: { type: String },
    notes: { type: String },
  },
  { timestamps: true }
);

export type PurchaseRequisitionDoc = InferSchemaType<typeof PurchaseRequisitionSchema> & { _id: mongoose.Types.ObjectId };

export const PurchaseRequisition =
  mongoose.models.PurchaseRequisition || mongoose.model('PurchaseRequisition', PurchaseRequisitionSchema);

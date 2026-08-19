import mongoose, { Schema, InferSchemaType } from 'mongoose';

const RFQLineSchema = new Schema(
  {
    partId: { type: Schema.Types.ObjectId, ref: 'Part' },
    name: { type: String, required: true },
    quantity: { type: Number, required: true },
  },
  { _id: false }
);

// What's being asked for, sent to one or more Suppliers for pricing —
// staff record the resulting SupplierQuotation.ts documents themselves
// (no supplier-facing portal exists anywhere in this app, same
// staff-mediated data entry convention as every other supplier interaction).
const RFQSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    rfqNumber: { type: String, required: true },
    requisitionId: { type: Schema.Types.ObjectId, ref: 'PurchaseRequisition' },
    items: { type: [RFQLineSchema], default: [] },
    supplierIds: { type: [Schema.Types.ObjectId], ref: 'Supplier', default: [] },
    status: { type: String, enum: ['Open', 'Closed'], default: 'Open' },
    dueDate: { type: Date },
    notes: { type: String },
  },
  { timestamps: true }
);

export type RFQDoc = InferSchemaType<typeof RFQSchema> & { _id: mongoose.Types.ObjectId };

export const RFQ = mongoose.models.RFQ || mongoose.model('RFQ', RFQSchema);

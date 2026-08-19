import mongoose, { Schema, InferSchemaType } from 'mongoose';

const SupplierQuotationLineSchema = new Schema(
  {
    partId: { type: Schema.Types.ObjectId, ref: 'Part' },
    name: { type: String, required: true },
    quantity: { type: Number, required: true },
    unitCost: { type: Number, required: true },
  },
  { _id: false }
);

// A supplier's priced response to an RFQ, entered by staff (see RFQ.ts's
// comment — no supplier portal exists). Selecting one (supplier-quotations/
// [id]/select.ts) creates the real PurchaseOrder and rejects its siblings —
// same "convert" shape as Quotation -> CustomerInvoice.
const SupplierQuotationSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    rfqId: { type: Schema.Types.ObjectId, ref: 'RFQ', required: true },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },
    quotationNumber: { type: String, required: true },
    items: { type: [SupplierQuotationLineSchema], default: [] },
    // Always server-computed from `items` — no tax, same internal-cost-record
    // reasoning as PurchaseOrder.ts (this becomes a PurchaseOrder verbatim).
    subtotal: { type: Number, required: true },
    total: { type: Number, required: true },
    validUntil: { type: Date },
    status: { type: String, enum: ['Submitted', 'Selected', 'Rejected'], default: 'Submitted' },
    notes: { type: String },
  },
  { timestamps: true }
);

export type SupplierQuotationDoc = InferSchemaType<typeof SupplierQuotationSchema> & { _id: mongoose.Types.ObjectId };

export const SupplierQuotation =
  mongoose.models.SupplierQuotation || mongoose.model('SupplierQuotation', SupplierQuotationSchema);

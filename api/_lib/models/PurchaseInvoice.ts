import mongoose, { Schema, InferSchemaType } from 'mongoose';

const PurchaseInvoiceLineSchema = new Schema(
  {
    partId: { type: Schema.Types.ObjectId, ref: 'Part', required: true },
    name: { type: String, required: true },
    quantity: { type: Number, required: true },
    unitCost: { type: Number, required: true },
  },
  { _id: false }
);

// The supplier's ACTUAL bill — distinct from the PurchaseOrder itself,
// which is what we asked to buy. What they billed can differ (a price
// change, a short shipment, an extra charge), which is exactly what
// matchStatus below exists to surface — a real 3-way match against the PO's
// ordered lines and the GRNs' received quantities, not just a duplicate
// record of the PO. No separate payment tracking here: payments still
// happen against the PurchaseOrder itself (purchaseOrderPayments.ts) — this
// document doesn't introduce a second, competing source of truth for money
// owed, only for what was actually billed vs. ordered vs. received.
const PurchaseInvoiceSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    purchaseInvoiceNumber: { type: String, required: true },
    purchaseOrderId: { type: Schema.Types.ObjectId, ref: 'PurchaseOrder', required: true },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },
    // The supplier's OWN reference for their bill — free text, not one of
    // our sequential numbers, since it's assigned by them, not us.
    supplierReference: { type: String },
    items: { type: [PurchaseInvoiceLineSchema], default: [] },
    subtotal: { type: Number, required: true },
    total: { type: Number, required: true },
    invoiceDate: { type: Date, required: true },
    dueDate: { type: Date },
    matchStatus: { type: String, enum: ['Matched', 'Discrepancy'], required: true },
    discrepancyNotes: { type: [String], default: [] },
    notes: { type: String },
  },
  { timestamps: true }
);

export type PurchaseInvoiceDoc = InferSchemaType<typeof PurchaseInvoiceSchema> & { _id: mongoose.Types.ObjectId };

export const PurchaseInvoice = mongoose.models.PurchaseInvoice || mongoose.model('PurchaseInvoice', PurchaseInvoiceSchema);

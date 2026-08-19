import mongoose, { Schema, InferSchemaType } from 'mongoose';

// Scoped to parts/counter orders only (per the module-independence roadmap's
// resolved decision) — a staged "confirmed but not yet fulfilled" order
// sitting ALONGSIDE the existing instant POS Sale (checkout.ts) and the
// existing service-side Quotation -> JobCard/Invoice path, neither of
// which this touches. Same customer-facing tax/discount treatment as
// Quotation.ts, since this is a real commitment to a customer, not an
// internal cost record like PurchaseOrder.
const SalesOrderLineSchema = new Schema(
  {
    partId: { type: Schema.Types.ObjectId, ref: 'Part', required: true },
    name: { type: String, required: true },
    quantity: { type: Number, required: true },
    unitPrice: { type: Number, required: true },
    // How much of this line has actually been handed over so far — same
    // partial-fulfillment shape as PurchaseOrder.items[].receivedQuantity.
    deliveredQuantity: { type: Number, default: 0 },
  },
  { _id: false }
);

const SalesOrderSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    salesOrderNumber: { type: String, required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
    items: { type: [SalesOrderLineSchema], default: [] },
    // Always server-computed from `items` — same computeTotals discipline
    // as Quotation/CustomerInvoice (api/_lib/accounting.ts).
    subtotal: { type: Number, required: true },
    discountPct: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    taxAmount: { type: Number, required: true },
    total: { type: Number, required: true },
    status: { type: String, enum: ['Confirmed', 'Partially Fulfilled', 'Fulfilled', 'Cancelled'], default: 'Confirmed' },
    notes: { type: String },
  },
  { timestamps: true }
);

export type SalesOrderDoc = InferSchemaType<typeof SalesOrderSchema> & { _id: mongoose.Types.ObjectId };

export const SalesOrder = mongoose.models.SalesOrder || mongoose.model('SalesOrder', SalesOrderSchema);

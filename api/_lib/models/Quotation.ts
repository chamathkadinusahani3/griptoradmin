import mongoose, { Schema, InferSchemaType } from 'mongoose';

const LineItemSchema = new Schema(
  {
    description: { type: String, required: true },
    quantity: { type: Number, required: true },
    unitPrice: { type: Number, required: true },
  },
  { _id: false }
);

const QuotationSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    jobCardId: { type: Schema.Types.ObjectId, ref: 'JobCard' },
    quoteNumber: { type: String, required: true },
    vehicle: { type: String, required: true },
    plate: { type: String },
    vehicleId: { type: Schema.Types.ObjectId, ref: 'Vehicle' },
    items: { type: [LineItemSchema], default: [] },
    // Always server-computed from `items` (api/quotations/index.ts,
    // api/quotations/[id].ts) — never trusted from the client.
    subtotal: { type: Number, required: true },
    // Snapshotted at creation time from the customer's discountPct — kept
    // fixed here so a later change to the customer's discount never alters
    // an already-issued quotation (or the invoice converted from it).
    discountPct: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    taxAmount: { type: Number, required: true },
    total: { type: Number, required: true },
    status: { type: String, enum: ['Draft', 'Pending', 'Approved', 'Rejected', 'Invoiced'], default: 'Draft' },
    validUntil: { type: Date },
    notes: { type: String },
  },
  { timestamps: true }
);

export type QuotationDoc = InferSchemaType<typeof QuotationSchema> & { _id: mongoose.Types.ObjectId };

export const Quotation = mongoose.models.Quotation || mongoose.model('Quotation', QuotationSchema);

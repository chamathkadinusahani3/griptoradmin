import mongoose, { Schema, InferSchemaType } from 'mongoose';

// Named CustomerInvoice (not Invoice) and routed at /api/customer-invoices —
// the `Invoice` model/route already exists for Griptor's own SaaS
// subscription billing of the tenant (super-admin side). This is a
// completely different thing: the garage's own invoicing of its customers.

const LineItemSchema = new Schema(
  {
    description: { type: String, required: true },
    quantity: { type: Number, required: true },
    unitPrice: { type: Number, required: true },
  },
  { _id: false }
);

const PaymentRecordSchema = new Schema(
  {
    amount: { type: Number, required: true },
    method: { type: String, enum: ['Cash', 'Card', 'Bank Transfer', 'Other'], required: true },
    date: { type: Date, required: true },
    notes: { type: String },
  },
  { _id: false }
);

const CustomerInvoiceSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    jobCardId: { type: Schema.Types.ObjectId, ref: 'JobCard' },
    quotationId: { type: Schema.Types.ObjectId, ref: 'Quotation' },
    invoiceNumber: { type: String, required: true },
    vehicle: { type: String, required: true },
    plate: { type: String },
    vehicleId: { type: Schema.Types.ObjectId, ref: 'Vehicle' },
    items: { type: [LineItemSchema], default: [] },
    // Always server-computed — see Quotation.ts's identical comment.
    subtotal: { type: Number, required: true },
    discountPct: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    taxAmount: { type: Number, required: true },
    total: { type: Number, required: true },
    status: { type: String, enum: ['Draft', 'Issued', 'Paid', 'Void'], default: 'Issued' },
    // paidAmount/balance/paymentStatus are server-computed from
    // paymentHistory (api/customer-invoices/[id]/payment.ts) — never set
    // directly by the client.
    paidAmount: { type: Number, default: 0 },
    balance: { type: Number, required: true },
    paymentStatus: { type: String, enum: ['Unpaid', 'Partial', 'Paid'], default: 'Unpaid' },
    paymentHistory: { type: [PaymentRecordSchema], default: [] },
    dueDate: { type: Date },
    notes: { type: String },
  },
  { timestamps: true }
);

export type CustomerInvoiceDoc = InferSchemaType<typeof CustomerInvoiceSchema> & { _id: mongoose.Types.ObjectId };

export const CustomerInvoice = mongoose.models.CustomerInvoice || mongoose.model('CustomerInvoice', CustomerInvoiceSchema);

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
    method: { type: String, enum: ['Cash', 'Card', 'Bank Transfer', 'Cheque', 'Other', 'PayHere'], required: true },
    date: { type: Date, required: true },
    notes: { type: String },
    // Only set for method: 'PayHere' — the notify callback's idempotency
    // key (PayHere's payment_id), so a redelivered notification can't
    // double-record the same payment.
    payherePaymentId: { type: String },
    // Only meaningful for method: 'Cheque'.
    chequeNumber: { type: String },
    // Which BankAccount this cheque/transfer went through — unset for Cash
    // (and typically PayHere, which settles to whatever account is on file
    // with the gateway, not tracked here).
    bankAccountId: { type: Schema.Types.ObjectId, ref: 'BankAccount' },
    // Reconciliation is deliberately a simple manual flag (not statement
    // import/matching) — flipped once this payment shows up on the actual
    // bank statement. See PurchaseOrder.ts's identical fields for the other
    // direction of money.
    reconciled: { type: Boolean, default: false },
    reconciledAt: { type: Date },
  }
  // No { _id: false } here (unlike the rest of this codebase's subdocument
  // convention) — reconciliation needs to address one specific payment
  // entry, and payments are append-only (never reordered/removed), so a
  // real per-entry _id is worth the extra bytes.
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
    // A real random opaque token (crypto.randomBytes — same convention as
    // Inspection.approvalToken) for the staff-shared "payment link" — since
    // PayHere's checkout is a form POST, not a single shareable URL the way
    // Stripe's Checkout Session was, this is OUR OWN public page's token;
    // that page looks the invoice up and auto-submits the real PayHere
    // form. Generated once, reused on subsequent "get payment link" clicks.
    payToken: { type: String },
    dueDate: { type: Date },
    notes: { type: String },
  },
  { timestamps: true }
);

export type CustomerInvoiceDoc = InferSchemaType<typeof CustomerInvoiceSchema> & { _id: mongoose.Types.ObjectId };

export const CustomerInvoice = mongoose.models.CustomerInvoice || mongoose.model('CustomerInvoice', CustomerInvoiceSchema);

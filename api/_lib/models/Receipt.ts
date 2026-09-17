import mongoose, { Schema, InferSchemaType } from 'mongoose';

export const RECEIPT_METHODS = ['Cash', 'Card', 'Bank Transfer', 'Cheque', 'Other'] as const;

// A single invoice allocation within one Receipt — the "Multi" part (one
// receipt can pay down several open invoices at once). Each allocation is
// applied via the existing recordCustomerInvoicePayment() (see
// routes/receipts/index.ts), so it posts through the exact same GL/paidAmount
// math a single-invoice payment would — this schema is just the record of
// how one physical payment got split, not a second source of truth.
const ReceiptAllocationSchema = new Schema(
  {
    invoiceId: { type: Schema.Types.ObjectId, ref: 'CustomerInvoice', required: true },
    amount: { type: Number, required: true },
  },
  { _id: false }
);

// ERP-Phase 7 — a general, office-recorded customer payment. Distinct from
// SF's CollectionRecord (a field collection tied to a salesperson/visit,
// single optional invoice): Receipt has no salesperson/visit, is entered
// directly against a known customer, and can allocate across multiple open
// invoices in one go. Append-only, same "a financial record, once made,
// isn't silently rewritten" discipline as Return.ts/CollectionRecord.
const ReceiptSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    receiptNumber: { type: String, required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    amount: { type: Number, required: true },
    method: { type: String, enum: RECEIPT_METHODS, required: true },
    chequeNumber: { type: String },
    bankAccountId: { type: Schema.Types.ObjectId, ref: 'BankAccount' },
    date: { type: Date, required: true },
    allocations: { type: [ReceiptAllocationSchema], default: [] },
    // amount minus the sum of allocations — a general on-account payment
    // not tied to any specific invoice. Posts its own Accounts-Receivable-
    // crediting GL entry (see the route) since nothing else does for this
    // portion.
    onAccountAmount: { type: Number, default: 0 },
    // ERP-Phase 11 (Utilization) — how much of onAccountAmount has since been
    // attributed to a specific invoice/return. onAccountAmount itself never
    // changes (it's the historical fact of what was received); this tracks
    // consumption the same way CreditNote/DebitNote/AdvancePayment's
    // appliedAmount does. Remaining = onAccountAmount - onAccountAppliedAmount.
    onAccountAppliedAmount: { type: Number, default: 0 },
    notes: { type: String },
  },
  { timestamps: true }
);

export type ReceiptDoc = InferSchemaType<typeof ReceiptSchema> & { _id: mongoose.Types.ObjectId };

export const Receipt = mongoose.models.Receipt || mongoose.model('Receipt', ReceiptSchema);

import mongoose, { Schema, InferSchemaType } from 'mongoose';

const PurchaseOrderLineSchema = new Schema(
  {
    partId: { type: Schema.Types.ObjectId, ref: 'Part', required: true },
    // Snapshotted at order time, same convention as JobCard.partsUsed — the
    // order still reads correctly even if the Part is later renamed/deleted.
    name: { type: String, required: true },
    quantity: { type: Number, required: true },
    unitCost: { type: Number, required: true },
  },
  { _id: false }
);

// Same shape as CustomerInvoice's PaymentRecordSchema, plus chequeNumber —
// the garage-pays-supplier direction of the same debit/credit record-keeping,
// so a supplier statement can be computed live the same "derive, don't
// store" way Supplier.openOrders/lastOrder/onTime already are.
const PaymentRecordSchema = new Schema(
  {
    amount: { type: Number, required: true },
    method: { type: String, enum: ['Cash', 'Card', 'Bank Transfer', 'Cheque', 'Other'], required: true },
    date: { type: Date, required: true },
    notes: { type: String },
    // Only meaningful for method: 'Cheque'.
    chequeNumber: { type: String },
    // Which BankAccount this cheque/transfer was drawn from — unset for Cash.
    bankAccountId: { type: Schema.Types.ObjectId, ref: 'BankAccount' },
    // Simple manual reconciliation flag — see CustomerInvoice.ts's identical
    // fields (the other direction of money) for the full reasoning.
    reconciled: { type: Boolean, default: false },
    reconciledAt: { type: Date },
  }
  // No { _id: false } — same reasoning as CustomerInvoice.ts's
  // PaymentRecordSchema: reconciliation needs a stable per-entry id.
);

const PurchaseOrderSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },
    poNumber: { type: String, required: true },
    items: { type: [PurchaseOrderLineSchema], default: [] },
    // Always server-computed from `items` — no tax here, this is an
    // internal cost record (what the garage pays a supplier), not a
    // customer-facing tax document like Quotation/CustomerInvoice.
    subtotal: { type: Number, required: true },
    total: { type: Number, required: true },
    status: { type: String, enum: ['Draft', 'Ordered', 'Received', 'Cancelled'], default: 'Draft' },
    expectedDate: { type: Date },
    receivedAt: { type: Date },
    notes: { type: String },
    // paidAmount/balance/paymentStatus are server-computed from
    // paymentHistory (api/_lib/purchaseOrderPayments.ts) — never set
    // directly by the client. Payments are only recordable once a PO is
    // Ordered or Received (a real commitment/delivery), never while Draft.
    paidAmount: { type: Number, default: 0 },
    balance: { type: Number, required: true },
    paymentStatus: { type: String, enum: ['Unpaid', 'Partial', 'Paid'], default: 'Unpaid' },
    paymentHistory: { type: [PaymentRecordSchema], default: [] },
  },
  { timestamps: true }
);

export type PurchaseOrderDoc = InferSchemaType<typeof PurchaseOrderSchema> & { _id: mongoose.Types.ObjectId };

export const PurchaseOrder = mongoose.models.PurchaseOrder || mongoose.model('PurchaseOrder', PurchaseOrderSchema);

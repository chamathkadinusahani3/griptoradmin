import mongoose, { Schema, InferSchemaType } from 'mongoose';

export const CHEQUE_STATUSES = ['Issued', 'Deposited', 'Cleared', 'Returned'] as const;
export const CHEQUE_SOURCE_TYPES = ['customer-invoice-payment', 'purchase-order-payment'] as const;

// First-class cheque lifecycle entity (ERP-Phase 3) — auto-created as a
// side effect whenever recordCustomerInvoicePayment()/
// recordPurchaseOrderPayment() records a Cheque-method payment, so Cheque
// Extend (due-date change) and Return Cheque Entry (bounce, reopening the
// linked balance) have real state to act on. The 4 pre-existing plain
// `chequeNumber` string fields elsewhere (CollectionRecord,
// CustomerInvoice.paymentHistory, PurchaseOrder.paymentHistory, Return) are
// left exactly as they are — no migration/backfill. Return.ts's own refund
// cheque and CollectionRecord's general on-account cheque are a deliberate,
// explicitly out-of-scope fast-follow for this phase: neither has the same
// clean, single-function, already-encapsulated balance-reversal target that
// recordCustomerInvoicePayment/recordPurchaseOrderPayment give here.
const ChequeSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    chequeNumber: { type: String, required: true },
    // 'incoming' = someone paid us by cheque (a CustomerInvoice payment);
    // 'outgoing' = we paid someone by cheque (a PurchaseOrder payment).
    direction: { type: String, enum: ['incoming', 'outgoing'], required: true },
    amount: { type: Number, required: true },
    bankAccountId: { type: Schema.Types.ObjectId, ref: 'BankAccount' },
    // Defaults to the payment date at creation (see the record* hooks) —
    // Cheque Extend is what actually gives this a real post-dated meaning.
    dueDate: { type: Date },
    status: { type: String, enum: CHEQUE_STATUSES, default: 'Issued' },
    sourceType: { type: String, enum: CHEQUE_SOURCE_TYPES, required: true },
    sourceId: { type: Schema.Types.ObjectId, required: true },
    // The exact paymentHistory subdocument this cheque came from — lets
    // Return Cheque Entry reverse precisely this one payment, not just "some
    // payment on this invoice/PO". Left untouched (append-only) when a
    // cheque returns; this document's own `status` is the source of truth
    // for whether it actually cleared, not the payment-history entry.
    paymentRecordId: { type: Schema.Types.ObjectId, required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer' },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier' },
    notes: { type: String },
    returnedAt: { type: Date },
    returnedReason: { type: String },
  },
  { timestamps: true }
);

export type ChequeDoc = InferSchemaType<typeof ChequeSchema> & { _id: mongoose.Types.ObjectId };

export const Cheque = mongoose.models.Cheque || mongoose.model('Cheque', ChequeSchema);

import mongoose, { Schema, InferSchemaType } from 'mongoose';

export const COLLECTION_METHODS = ['Cash', 'Cheque', 'Card', 'Bank Transfer', 'Other'] as const;

// A field collection recorded by a salesperson, optionally during a
// SalesVisit. When `invoiceId` is set, the money is applied against that
// specific open invoice (delegates to the existing
// recordCustomerInvoicePayment(), which already posts its own GL entry —
// this record is then just a Sales Force visibility log, not a second
// posting). When absent, it's a general on-account collection and this
// model's own route posts a best-effort journal entry crediting Accounts
// Receivable directly. Append-only, like Return.ts — no edit/delete route,
// same "a financial record, once made, isn't silently rewritten" discipline.
const CollectionRecordSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    salespersonId: { type: Schema.Types.ObjectId, ref: 'Salesperson', required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    visitId: { type: Schema.Types.ObjectId, ref: 'SalesVisit' },
    invoiceId: { type: Schema.Types.ObjectId, ref: 'CustomerInvoice' },
    amount: { type: Number, required: true },
    method: { type: String, enum: COLLECTION_METHODS, required: true },
    chequeNumber: { type: String },
    bankAccountId: { type: Schema.Types.ObjectId, ref: 'BankAccount' },
    date: { type: Date, required: true },
    notes: { type: String },
  },
  { timestamps: true }
);

export type CollectionRecordDoc = InferSchemaType<typeof CollectionRecordSchema> & { _id: mongoose.Types.ObjectId };

export const CollectionRecord = mongoose.models.CollectionRecord || mongoose.model('CollectionRecord', CollectionRecordSchema);

import mongoose, { Schema, InferSchemaType } from 'mongoose';

const JournalLineSchema = new Schema(
  {
    accountId: { type: Schema.Types.ObjectId, ref: 'ChartOfAccounts', required: true },
    debit: { type: Number, default: 0 },
    credit: { type: Number, default: 0 },
  },
  { _id: false }
);

// The real double-entry ledger — every line here comes from an existing
// money-movement route (see journal.ts's postJournalEntry, the only writer
// of this collection) auto-posting a balanced entry, never entered
// directly by a user. sourceType/sourceId trace each entry back to the
// document that caused it, the same "reference, don't duplicate" pattern
// Return.ts uses for sourceId/sourceType against a Sale or PurchaseOrder.
const JournalEntrySchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    date: { type: Date, required: true },
    description: { type: String, required: true },
    sourceType: {
      type: String,
      enum: ['sale', 'customer-payment', 'supplier-payment', 'expense', 'payroll', 'return-refund'],
      required: true,
    },
    sourceId: { type: Schema.Types.ObjectId, required: true },
    lines: { type: [JournalLineSchema], required: true },
  },
  { timestamps: true }
);

export type JournalEntryDoc = InferSchemaType<typeof JournalEntrySchema> & { _id: mongoose.Types.ObjectId };

export const JournalEntry = mongoose.models.JournalEntry || mongoose.model('JournalEntry', JournalEntrySchema);

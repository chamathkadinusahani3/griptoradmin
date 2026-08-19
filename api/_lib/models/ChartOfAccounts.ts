import mongoose, { Schema, InferSchemaType } from 'mongoose';

export const ACCOUNT_TYPES = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'] as const;

// Foundation for Phase 8's General Ledger (double-entry auto-posting) —
// this phase only introduces the taxonomy itself and lets Expense/
// CustomerInvoice/PurchaseOrder/Sale optionally tag which account a
// transaction belongs to. No journal entries exist yet; that's Phase 8.
const ChartOfAccountsSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    code: { type: String, required: true },
    name: { type: String, required: true },
    type: { type: String, enum: ACCOUNT_TYPES, required: true },
    description: { type: String },
    // Seeded defaults (see chartOfAccountsSeed.ts) — protected from deletion
    // since Expense.category already auto-maps onto some of them and Phase
    // 8's auto-posting will assume core accounts like Cash/AR/AP exist.
    isSystem: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export type ChartOfAccountsDoc = InferSchemaType<typeof ChartOfAccountsSchema> & { _id: mongoose.Types.ObjectId };

export const ChartOfAccounts = mongoose.models.ChartOfAccounts || mongoose.model('ChartOfAccounts', ChartOfAccountsSchema);

import mongoose, { Schema, InferSchemaType } from 'mongoose';

export const EXPENSE_CATEGORIES = ['Rent', 'Utilities', 'Salaries', 'Parts & Supplies', 'Equipment', 'Marketing', 'Other'] as const;

const ExpenseSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
    expenseNumber: { type: String, required: true },
    category: { type: String, enum: EXPENSE_CATEGORIES, required: true },
    description: { type: String, required: true },
    amount: { type: Number, required: true },
    date: { type: Date, required: true },
    vendorName: { type: String },
    notes: { type: String },
    // How this expense was actually paid — for Cash Management's till
    // reconciliation (api/_lib/routes/cash-sessions). Defaults to Cash,
    // the small-shop norm, rather than forcing every existing expense flow
    // to specify one.
    paymentMethod: { type: String, enum: ['Cash', 'Card', 'Bank Transfer', 'Cheque', 'Other'], default: 'Cash' },
    // Which Chart of Accounts entry this belongs to — auto-defaulted from
    // `category` via accountIdForExpenseCategory() when not given
    // explicitly (api/_lib/routes/expenses/index.ts). Foundation for
    // Phase 8's GL auto-posting; not consumed by anything yet.
    accountId: { type: Schema.Types.ObjectId, ref: 'ChartOfAccounts' },
  },
  { timestamps: true }
);

export type ExpenseDoc = InferSchemaType<typeof ExpenseSchema> & { _id: mongoose.Types.ObjectId };

export const Expense = mongoose.models.Expense || mongoose.model('Expense', ExpenseSchema);

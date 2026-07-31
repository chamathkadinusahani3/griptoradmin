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
  },
  { timestamps: true }
);

export type ExpenseDoc = InferSchemaType<typeof ExpenseSchema> & { _id: mongoose.Types.ObjectId };

export const Expense = mongoose.models.Expense || mongoose.model('Expense', ExpenseSchema);

export const EXPENSE_CATEGORIES = ['Rent', 'Utilities', 'Salaries', 'Parts & Supplies', 'Equipment', 'Marketing', 'Other'] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export interface Expense {
  id: string;
  expenseNumber: string;
  branchId?: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  date: string;
  vendorName?: string;
  notes?: string;
  createdAt: string;
}

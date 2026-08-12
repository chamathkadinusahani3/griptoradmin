export interface FinancialOverview {
  range: { from: string; to: string };
  revenue: {
    sales: number;
    invoicePayments: number;
    customerRefunds: number;
    total: number;
  };
  expenses: {
    operatingExpenses: number;
    supplierPayments: number;
    supplierCredits: number;
    payroll: number;
    total: number;
  };
  netProfit: number;
  marginPct: number | null;
  monthlyTrend: { month: string; revenue: number; expenses: number; net: number }[];
  expenseByCategory: { category: string; amount: number }[];
}

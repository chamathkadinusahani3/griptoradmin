export interface SalesDashboardPeriodSummary {
  salesRevenue: number;
  transactions: number;
  invoicePayments: number;
  combinedRevenue: number;
}

export interface SalesDashboardTopProduct {
  id: string;
  name: string;
  revenue: number;
  grossProfit: number;
}

export interface SalesDashboardTopCustomer {
  id: string;
  name: string;
  revenue: number;
}

export interface SalesDashboardTrendPoint {
  date: string;
  salesRevenue: number;
  invoicePayments: number;
}

export interface SalesDashboard {
  range: { from: string; to: string };
  today: SalesDashboardPeriodSummary;
  thisMonth: SalesDashboardPeriodSummary;
  outstanding: { totalOutstanding: number };
  returns: { totalReturns: number; totalAmount: number; totalRefunded: number };
  grossProfit: { totalRevenue: number; totalCogs: number; totalGrossProfit: number; overallMarginPct: number | null };
  dailyTrend: SalesDashboardTrendPoint[];
  topProducts: SalesDashboardTopProduct[];
  topCustomers: SalesDashboardTopCustomer[];
}

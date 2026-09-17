export type SalesReportView = 'summary' | 'detail';

export interface SalesReportSummaryRow {
  date: string;
  salesRevenue: number;
  invoicePayments: number;
  transactions: number;
}

export interface SalesReportDetailRow {
  type: 'Sale' | 'Invoice Payment';
  reference: string;
  date: string;
  amount: number;
  method: string;
  itemCount?: number;
}

export interface SalesReport {
  range: { from: string; to: string };
  view: SalesReportView;
  summary: {
    totalSalesRevenue: number;
    totalTransactions: number;
    avgTransactionValue: number;
    invoicePaymentsCollected: number;
    combinedRevenue: number;
  };
  rows: SalesReportSummaryRow[] | SalesReportDetailRow[];
}

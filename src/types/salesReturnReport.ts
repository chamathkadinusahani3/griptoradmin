export interface SalesReturnReportRow {
  reason: string;
  count: number;
  amount: number;
}

export interface SalesReturnReport {
  range: { from: string; to: string };
  summary: {
    totalReturns: number;
    totalAmount: number;
    totalRefunded: number;
    avgReturnValue: number;
    statusBreakdown: Record<string, number>;
  };
  rows: SalesReturnReportRow[];
}

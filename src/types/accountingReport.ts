export interface AccountingReport {
  range: { from: string; to: string };
  quotations: {
    total: number;
    byStatus: Record<string, number>;
    conversionRate: number;
  };
  invoices: {
    total: number;
    totalInvoiced: number;
    totalCollected: number;
    overdueAmount: number;
    collectionRate: number;
    byPaymentStatus: Record<string, number>;
  };
}

// Mirrors api/_lib/routes/customers/[id]/dealer-performance.ts's response
// shape exactly. Every field is computed live from transaction data on the
// backend — creditNotesCount/debitNotesCount are `null`, not 0, when the
// underlying data model can't attribute that document type to a customer
// yet (see that route's own comment for why).
export interface DealerPerformance {
  totalSales: number;
  salesThisMonth: number;
  salesThisYear: number;
  averageMonthlySales: number;
  totalOutstanding: number;
  overdueAmount: number;
  creditUtilizationPct: number | null;
  returnRatioPct: number | null;
  onTimePaymentRatePct: number | null;
  returnedValue: number;
  salesOrderCount: number;
  invoiceCount: number;
  returnedInvoiceCount: number;
  chequeReturnsCount: number;
  creditNotesCount: number | null;
  debitNotesCount: number | null;
}

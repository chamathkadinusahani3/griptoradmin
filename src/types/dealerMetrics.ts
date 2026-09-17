export interface DealerMetrics {
  avgDaysToPay: number | null;
  onTimePaymentRatePct: number | null;
  lastPurchaseDate: string | null;
  purchasesLast90Days: number;
  purchasesPrior90Days: number;
  purchaseTrend: 'up' | 'down' | 'flat';
  isInViolation: boolean;
  daysPastCreditPeriod: number;
  creditUtilizationPct: number | null;
  /** Dealer Credit Control roadmap Module 1 — returnedAmount / totalInvoiced. */
  returnRatioPct: number | null;
}

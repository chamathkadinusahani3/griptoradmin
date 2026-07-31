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
}

export type GrossProfitDimension = 'product' | 'customer' | 'salesperson';

export interface GrossProfitReportRow {
  id: string;
  name: string;
  qty?: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  marginPct: number | null;
}

export interface GrossProfitReport {
  range: { from: string; to: string };
  dimension: GrossProfitDimension;
  /** True for the 'product' dimension — COGS there uses the part's CURRENT cost, not the cost at the time of that historical sale. */
  costIsApproximate: boolean;
  summary: {
    totalRevenue: number;
    totalCogs: number;
    totalGrossProfit: number;
    overallMarginPct: number | null;
  };
  rows: GrossProfitReportRow[];
}

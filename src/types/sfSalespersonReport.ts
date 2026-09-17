export interface SfSalespersonReportRow {
  salespersonId: string;
  code: string;
  name: string;
  territory?: string;
  status: 'Active' | 'Inactive';
  actualSales: number;
  targetAmount: number;
  achievementPct: number | null;
  visitsCompleted: number;
  collectionsTotal: number;
  /** 0 = no commission configured for this salesperson. */
  commissionPct: number;
  /** Derived — actualSales × commissionPct, never stored. */
  commissionAmount: number;
}

export interface SfSalespersonReport {
  range: { from: string; to: string };
  summary: {
    totalActualSales: number;
    totalTargetAmount: number;
    overallAchievementPct: number | null;
    topPerformerName: string | null;
    totalCommissionAmount: number;
  };
  rows: SfSalespersonReportRow[];
}

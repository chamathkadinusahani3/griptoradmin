export const TARGET_PERIOD_TYPES = ['Daily', 'Weekly', 'Monthly'] as const;
export type TargetPeriodType = (typeof TARGET_PERIOD_TYPES)[number];

export interface SalesTarget {
  id: string;
  salespersonId: string;
  salespersonName?: string;
  salespersonCode?: string;
  periodType: TargetPeriodType;
  periodStart: string;
  periodEnd: string;
  targetAmount: number;
  actualSales: number;
  achievementPct: number;
  createdAt: string;
}

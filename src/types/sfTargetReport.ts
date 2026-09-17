export interface SfTargetReportRow {
  targetId: string;
  salespersonName: string;
  salespersonCode?: string;
  periodType: 'Daily' | 'Weekly' | 'Monthly';
  periodStart: string;
  periodEnd: string;
  targetAmount: number;
  actualAmount: number;
  achievementPct: number | null;
}

export interface SfTargetReport {
  range: { from: string; to: string };
  summary: {
    targetCount: number;
    totalTarget: number;
    totalActual: number;
    overallAchievementPct: number | null;
    metCount: number;
  };
  rows: SfTargetReportRow[];
}

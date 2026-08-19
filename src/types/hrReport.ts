export interface HrReport {
  range: { from: string; to: string };
  headcount: number;
  payrollCost: number;
  openOpenings: number;
  leave: {
    total: number;
    byStatus: Record<string, number>;
    approvedDays: number;
  };
  recruitment: {
    total: number;
    byStatus: Record<string, number>;
  };
}

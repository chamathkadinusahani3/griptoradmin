export interface InspectionReport {
  range: { from: string; to: string };
  total: number;
  passRate: number;
  approvalRate: number | null;
  approvedAdditionalCost: number;
  byResult: { Pass: number; Advisory: number; Fail: number };
  byApproval: { not_required: number; pending: number; approved: number; rejected: number };
  dailyVolume: { date: string; count: number }[];
}

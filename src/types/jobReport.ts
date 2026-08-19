export interface JobReport {
  range: { from: string; to: string };
  totalJobs: number;
  completedJobs: number;
  cancelledJobs: number;
  completionRate: number;
  avgTurnaroundHours: number | null;
  byStatus: Record<string, number>;
  byTechnician: { technician: string; total: number; completed: number }[];
  byService: { service: string; count: number }[];
  dailyVolume: { date: string; count: number }[];
}

export interface SfVisitReportRow {
  visitId: string;
  salespersonName: string;
  customerName: string;
  visitDate: string;
  purpose?: string;
  status: 'Pending' | 'In Progress' | 'Completed' | 'Cancelled' | 'Rescheduled';
  durationMinutes?: number;
}

export interface SfVisitReport {
  range: { from: string; to: string };
  summary: {
    total: number;
    completed: number;
    cancelled: number;
    completionRatePct: number;
    avgDurationMinutes: number | null;
  };
  rows: SfVisitReportRow[];
}

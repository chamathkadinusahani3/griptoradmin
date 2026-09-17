export interface SfActivityReportRow {
  salespersonId: string;
  name: string;
  code: string;
  visitsScheduled: number;
  visitsCompleted: number;
  visitsCancelled: number;
  collectionsCount: number;
  collectionsAmount: number;
}

export interface SfActivityReport {
  range: { from: string; to: string };
  summary: {
    totalVisits: number;
    totalCollections: number;
    mostActiveSalespersonName: string | null;
  };
  rows: SfActivityReportRow[];
}

export interface TopCustomersReportRow {
  rank: number;
  id: string;
  name: string;
  type: string;
  revenue: number;
  docCount: number;
  avgOrderValue: number;
}

export interface TopCustomersReport {
  range: { from: string; to: string };
  summary: { totalRevenue: number; totalCustomers: number; shown: number };
  rows: TopCustomersReportRow[];
}

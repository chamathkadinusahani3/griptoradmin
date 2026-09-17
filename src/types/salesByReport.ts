export type SalesByDimension = 'customer' | 'branch' | 'salesperson' | 'paymentMethod';

export interface SalesByReportRow {
  id: string;
  name: string;
  revenue: number;
  docCount: number;
}

export interface SalesByReport {
  range: { from: string; to: string };
  dimension: SalesByDimension;
  summary: { totalRevenue: number; groupCount: number };
  rows: SalesByReportRow[];
}

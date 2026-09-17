export interface SlowMovingProductsReportRow {
  id: string;
  name: string;
  category: string;
  stock: number;
  branchId?: string;
  branchName?: string;
  qtySoldInRange: number;
  lastSoldAt: string | null;
  daysSinceLastSale: number | null;
  stockValue: number;
}

export interface SlowMovingProductsReportBranchSummary {
  branchId?: string;
  branchName: string;
  totalParts: number;
  zeroInRangeCount: number;
  totalStockValueAtRisk: number;
}

export interface SlowMovingProductsReport {
  range: { from: string; to: string };
  summary: { totalParts: number; zeroInRangeCount: number; neverSoldCount: number; totalStockValueAtRisk: number };
  byBranch: SlowMovingProductsReportBranchSummary[];
  rows: SlowMovingProductsReportRow[];
}

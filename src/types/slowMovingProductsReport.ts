export interface SlowMovingProductsReportRow {
  id: string;
  name: string;
  category: string;
  stock: number;
  qtySoldInRange: number;
  lastSoldAt: string | null;
  daysSinceLastSale: number | null;
  stockValue: number;
}

export interface SlowMovingProductsReport {
  range: { from: string; to: string };
  summary: { totalParts: number; zeroInRangeCount: number; neverSoldCount: number; totalStockValueAtRisk: number };
  rows: SlowMovingProductsReportRow[];
}

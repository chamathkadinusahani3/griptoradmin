export interface PurchaseReport {
  range: { from: string; to: string };
  orders: {
    total: number;
    byStatus: Record<'Draft' | 'Ordered' | 'Partially Received' | 'Received' | 'Cancelled', number>;
    totalSpend: number;
    avgOrderValue: number;
    onTimeRate: number | null;
  };
  dailySpend: { date: string; amount: number }[];
  topSuppliers: { name: string; spend: number; orderCount: number }[];
  topParts: { name: string; qty: number; spend: number }[];
}

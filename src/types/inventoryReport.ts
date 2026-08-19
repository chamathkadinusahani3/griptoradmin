export interface InventoryReport {
  range: { from: string; to: string };
  totalValue: number;
  totalItems: number;
  lowStockCount: number;
  outOfStockCount: number;
  salesRevenue: number;
  unitsSold: number;
  dailySales: { date: string; revenue: number }[];
  byCategory: { category: string; value: number; count: number }[];
  topItemsByValue: { name: string; category: string; stock: number; value: number }[];
  topSellingItems: { name: string; qty: number; revenue: number }[];
}

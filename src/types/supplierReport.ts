export interface SupplierReport {
  range: { from: string; to: string };
  summary: {
    totalSuppliers: number;
    totalOutstanding: number;
    totalSpendInRange: number;
  };
  suppliers: {
    id: string;
    name: string;
    spendInRange: number;
    orderCountInRange: number;
    outstanding: number;
    onTime: number | null;
    lastOrder: string | null;
  }[];
}

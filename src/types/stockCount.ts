export interface StockCountLine {
  partId: string;
  name: string;
  systemQty: number;
  countedQty: number | null;
}

export interface StockCount {
  id: string;
  branchId?: string;
  warehouseId?: string;
  status: 'Open' | 'Finalized';
  lines: StockCountLine[];
  finalizedAt?: string;
  notes?: string;
  createdAt: string;
}

export interface StockIssueLine {
  partId: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface StockIssue {
  id: string;
  stockIssueNumber: string;
  branchId?: string;
  warehouseId?: string;
  items: StockIssueLine[];
  totalValue: number;
  issuedTo: string;
  departmentId?: string;
  departmentName?: string;
  notes?: string;
  createdAt: string;
}

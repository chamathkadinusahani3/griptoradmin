export type PurchaseOrderStatus = 'Draft' | 'Ordered' | 'Received' | 'Cancelled';

export interface PurchaseOrderLine {
  partId: string;
  name: string;
  quantity: number;
  unitCost: number;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  supplier?: string;
  branchId?: string;
  items: PurchaseOrderLine[];
  subtotal: number;
  total: number;
  status: PurchaseOrderStatus;
  expectedDate?: string;
  receivedAt?: string;
  notes?: string;
  createdAt: string;
}

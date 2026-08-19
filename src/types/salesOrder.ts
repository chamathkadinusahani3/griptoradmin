export type SalesOrderStatus = 'Confirmed' | 'Partially Fulfilled' | 'Fulfilled' | 'Cancelled';

export interface SalesOrderLine {
  partId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  deliveredQuantity: number;
}

export interface SalesOrder {
  id: string;
  salesOrderNumber: string;
  customerId: string;
  customerName?: string;
  branchId?: string;
  items: SalesOrderLine[];
  subtotal: number;
  discountPct: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  status: SalesOrderStatus;
  notes?: string;
  createdAt: string;
}

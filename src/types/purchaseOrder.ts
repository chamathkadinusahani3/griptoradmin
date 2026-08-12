export type PurchaseOrderStatus = 'Draft' | 'Ordered' | 'Received' | 'Cancelled';
export type SupplierPaymentStatus = 'Unpaid' | 'Partial' | 'Paid';
export type SupplierPaymentMethod = 'Cash' | 'Card' | 'Bank Transfer' | 'Cheque' | 'Other';

export interface PurchaseOrderLine {
  partId: string;
  name: string;
  quantity: number;
  unitCost: number;
}

export interface SupplierPaymentRecord {
  id?: string;
  amount: number;
  method: SupplierPaymentMethod;
  date: string;
  notes?: string;
  chequeNumber?: string;
  bankAccountId?: string;
  reconciled?: boolean;
  reconciledAt?: string;
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
  paidAmount: number;
  balance: number;
  paymentStatus: SupplierPaymentStatus;
  paymentHistory: SupplierPaymentRecord[];
  createdAt: string;
}

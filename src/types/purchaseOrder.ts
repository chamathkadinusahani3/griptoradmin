export type PurchaseOrderStatus = 'Draft' | 'Ordered' | 'Partially Received' | 'Received' | 'Cancelled';
export type SupplierPaymentStatus = 'Unpaid' | 'Partial' | 'Paid';
export type SupplierPaymentMethod = 'Cash' | 'Card' | 'Bank Transfer' | 'Cheque' | 'Other';

export interface PurchaseOrderLine {
  partId: string;
  name: string;
  quantity: number;
  unitCost: number;
  /** The price originally agreed/quoted by the supplier — distinct from unitCost. Data-capture only, doesn't affect totals. */
  promisedPrice: number;
  /** Manufacturer/brand-specific discount negotiated for this line, as a percentage. Data-capture only, doesn't affect totals. */
  brandDiscountPct: number;
  receivedQuantity: number;
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
  discountAmount?: number;
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
  creditPeriodDays: number;
  expectedDate?: string;
  receivedAt?: string;
  notes?: string;
  paidAmount: number;
  settlementDiscountTotal: number;
  balance: number;
  paymentStatus: SupplierPaymentStatus;
  paymentHistory: SupplierPaymentRecord[];
  createdAt: string;
}

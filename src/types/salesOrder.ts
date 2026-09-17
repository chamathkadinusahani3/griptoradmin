import { Attachment } from './attachment';

export type SalesOrderStatus = 'Pending Approval' | 'Confirmed' | 'Partially Fulfilled' | 'Fulfilled' | 'Cancelled';
export type SalesOrderDiscountType = 'amount' | 'percent';

export interface SalesOrderLine {
  partId: string;
  name: string;
  isManualEntry: boolean;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  discount1Type: SalesOrderDiscountType;
  discount1Value: number;
  discount2Type: SalesOrderDiscountType;
  discount2Value: number;
  lineTotal: number;
  deliveredQuantity: number;
  batchNumber?: string;
  serialNumber?: string;
  expiryDate?: string;
}

export interface SalesOrder {
  id: string;
  salesOrderNumber: string;
  customerId: string;
  customerName?: string;
  branchId?: string;
  salespersonId?: string;
  jobCardId?: string;
  jobCardLabel?: string;
  departmentId?: string;
  departmentName?: string;
  creditPeriod?: string;
  scheduledDeliveryDate?: string;
  deliveryName?: string;
  deliveryAddress?: string;
  items: SalesOrderLine[];
  subtotal: number;
  discountPct: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  status: SalesOrderStatus;
  notes?: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectionReason?: string;
  attachments: Attachment[];
  createdAt: string;
}

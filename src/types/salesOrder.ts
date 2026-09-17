import { Attachment } from './attachment';

export type SalesOrderStatus = 'Pending Approval' | 'Confirmed' | 'Partially Fulfilled' | 'Fulfilled' | 'Cancelled';
export type SalesOrderDiscountType = 'amount' | 'percent';
export type SalesOrderPayType = 'Cash' | 'Credit';
export type SalesOrderVatType = 'Vat' | 'Non Vat';

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
  payType: SalesOrderPayType;
  scheduledDeliveryDate?: string;
  deliveryMarkingDate?: string;
  deliveryType: string;
  deliveryName?: string;
  deliveryAddress?: string;
  customerAddress?: string;
  customerTel?: string;
  vatType: SalesOrderVatType;
  vatNumber?: string;
  svatNumber?: string;
  brand?: string;
  items: SalesOrderLine[];
  subtotal: number;
  discountPct: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  status: SalesOrderStatus;
  notes?: string;
  staffNote?: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectionReason?: string;
  attachments: Attachment[];
  createdAt: string;
}

import { Attachment } from './attachment';

export type ReturnDirection = 'customer' | 'supplier';
export type ReturnSourceType = 'sale' | 'purchase-order' | 'customer-invoice';
export type ReturnRefundMethod = 'Cash' | 'Card' | 'Bank Transfer' | 'Cheque' | 'Other';

export const RETURN_REASONS = [
  'Defective/Faulty',
  'Wrong Item',
  'Damaged in Transit',
  'Customer Changed Mind',
  'Excess/Overstock',
  'Quality Issue',
  'Duplicate Order',
  'Other',
] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number];

export const RETURN_STATUSES = ['Pending', 'Inspected', 'Approved', 'Rejected'] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];

export const RETURN_REFUND_STATUSES = ['Requested', 'Approved', 'Paid'] as const;
export type ReturnRefundStatus = (typeof RETURN_REFUND_STATUSES)[number];

export interface ReturnLine {
  /** Absent for a 'customer-invoice'-sourced line — CustomerInvoice items carry no Part reference (see Return.ts's comment); `name` doubles as that line's free-text description. */
  partId?: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface Return {
  id: string;
  direction: ReturnDirection;
  sourceType: ReturnSourceType;
  sourceId: string;
  returnNumber: string;
  items: ReturnLine[];
  totalAmount: number;
  reason: ReturnReason;
  notes?: string;
  /** Defaults to 'Approved' for a tenant that hasn't opted into requireReturnApproval, or any return predating this field. */
  status: ReturnStatus;
  inspectedBy?: string;
  inspectedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  refundAmount?: number;
  refundMethod?: ReturnRefundMethod;
  chequeNumber?: string;
  bankAccountId?: string;
  refundDate?: string;
  reconciled: boolean;
  reconciledAt?: string;
  /** Only meaningful when refundAmount is set. Defaults to 'Paid' for a return predating this field (refunds were always immediate before). */
  refundStatus?: ReturnRefundStatus;
  refundApprovedBy?: string;
  refundApprovedAt?: string;
  refundPaidBy?: string;
  refundPaidAt?: string;
  attachments: Attachment[];
  party?: string;
  reference?: string;
  createdAt: string;
}

export type ReturnDirection = 'customer' | 'supplier';
export type ReturnSourceType = 'sale' | 'purchase-order';
export type ReturnRefundMethod = 'Cash' | 'Card' | 'Bank Transfer' | 'Cheque' | 'Other';

export interface ReturnLine {
  partId: string;
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
  reason: string;
  notes?: string;
  refundAmount?: number;
  refundMethod?: ReturnRefundMethod;
  chequeNumber?: string;
  bankAccountId?: string;
  refundDate?: string;
  reconciled: boolean;
  reconciledAt?: string;
  party?: string;
  reference?: string;
  createdAt: string;
}

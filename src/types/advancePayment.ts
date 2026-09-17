export const ADVANCE_PAYMENT_METHODS = ['Cash', 'Card', 'Bank Transfer', 'Cheque', 'Other'] as const;
export type AdvancePaymentMethod = (typeof ADVANCE_PAYMENT_METHODS)[number];
export const ADVANCE_PAYMENT_STATUSES = ['Open', 'Fully Applied', 'Void'] as const;
export type AdvancePaymentStatus = (typeof ADVANCE_PAYMENT_STATUSES)[number];
export type AdvancePaymentDirection = 'customer' | 'supplier';

export interface AdvancePayment {
  id: string;
  advancePaymentNumber: string;
  direction: AdvancePaymentDirection;
  customerId?: string;
  customerName?: string;
  supplierId?: string;
  supplierName?: string;
  amount: number;
  method: AdvancePaymentMethod;
  chequeNumber?: string;
  bankAccountId?: string;
  date: string;
  appliedAmount: number;
  remainingAmount: number;
  status: AdvancePaymentStatus;
  notes?: string;
  voidedAt?: string;
  voidReason?: string;
  createdAt: string;
}

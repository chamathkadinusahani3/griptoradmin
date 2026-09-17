export const CHEQUE_STATUSES = ['Issued', 'Deposited', 'Cleared', 'Returned'] as const;
export type ChequeStatus = (typeof CHEQUE_STATUSES)[number];
export type ChequeDirection = 'incoming' | 'outgoing';
export type ChequeSourceType = 'customer-invoice-payment' | 'purchase-order-payment';

export interface Cheque {
  id: string;
  chequeNumber: string;
  direction: ChequeDirection;
  amount: number;
  bankAccountId?: string;
  dueDate?: string;
  status: ChequeStatus;
  sourceType: ChequeSourceType;
  sourceId: string;
  sourceNumber?: string;
  customerId?: string;
  customerName?: string;
  supplierId?: string;
  supplierName?: string;
  notes?: string;
  returnedAt?: string;
  returnedReason?: string;
  createdAt: string;
}

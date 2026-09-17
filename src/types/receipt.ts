export const RECEIPT_METHODS = ['Cash', 'Card', 'Bank Transfer', 'Cheque', 'Other'] as const;
export type ReceiptMethod = (typeof RECEIPT_METHODS)[number];

export interface ReceiptAllocation {
  invoiceId: string;
  invoiceNumber?: string;
  amount: number;
}

export interface Receipt {
  id: string;
  receiptNumber: string;
  customerId: string;
  customerName?: string;
  amount: number;
  method: ReceiptMethod;
  chequeNumber?: string;
  bankAccountId?: string;
  date: string;
  allocations: ReceiptAllocation[];
  onAccountAmount: number;
  onAccountAppliedAmount: number;
  notes?: string;
  createdAt: string;
}

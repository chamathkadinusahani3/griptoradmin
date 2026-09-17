export const CUSTOMER_DEBIT_NOTE_STATUSES = ['Pending', 'Confirmed', 'Void'] as const;
export type CustomerDebitNoteStatus = (typeof CUSTOMER_DEBIT_NOTE_STATUSES)[number];

export interface CustomerDebitNote {
  id: string;
  debitNoteNumber: string;
  customerId: string;
  customerName?: string;
  customerInvoiceId: string;
  invoiceNumber?: string;
  amount: number;
  reason: string;
  status: CustomerDebitNoteStatus;
  approvedBy?: string;
  approvedAt?: string;
  notes?: string;
  voidedAt?: string;
  voidReason?: string;
  createdAt: string;
}

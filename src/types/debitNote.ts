export const DEBIT_NOTE_STATUSES = ['Pending', 'Confirmed', 'Void'] as const;
export type DebitNoteStatus = (typeof DEBIT_NOTE_STATUSES)[number];

export interface DebitNote {
  id: string;
  debitNoteNumber: string;
  returnId: string;
  returnNumber?: string;
  supplierId: string;
  supplierName?: string;
  amount: number;
  appliedAmount: number;
  remainingAmount: number;
  status: DebitNoteStatus;
  approvedBy?: string;
  approvedAt?: string;
  reason?: string;
  notes?: string;
  voidedAt?: string;
  voidReason?: string;
  createdAt: string;
}

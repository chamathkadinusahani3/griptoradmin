export const CREDIT_NOTE_STATUSES = ['Open', 'Fully Applied', 'Void'] as const;
export type CreditNoteStatus = (typeof CREDIT_NOTE_STATUSES)[number];

export interface CreditNote {
  id: string;
  creditNoteNumber: string;
  returnId: string;
  returnNumber?: string;
  amount: number;
  appliedAmount: number;
  remainingAmount: number;
  status: CreditNoteStatus;
  reason?: string;
  notes?: string;
  voidedAt?: string;
  voidReason?: string;
  createdAt: string;
}

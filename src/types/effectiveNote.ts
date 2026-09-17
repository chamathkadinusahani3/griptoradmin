export const EFFECTIVE_NOTE_STATUSES = ['Open', 'Fully Applied', 'Void'] as const;
export type EffectiveNoteStatus = (typeof EFFECTIVE_NOTE_STATUSES)[number];

export interface EffectiveNote {
  id: string;
  effectiveNoteNumber: string;
  customerId: string;
  customerName?: string;
  warrantyClaimId?: string;
  warrantyClaimNumber?: string;
  claimedAmount: number;
  approvedAmount: number;
  amount: number;
  appliedAmount: number;
  remainingAmount: number;
  status: EffectiveNoteStatus;
  reason?: string;
  notes?: string;
  voidedAt?: string;
  voidReason?: string;
  createdAt: string;
}

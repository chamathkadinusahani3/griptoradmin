export const UTILIZATION_SOURCE_TYPES = ['creditNote', 'debitNote', 'advancePayment', 'receipt'] as const;
export type UtilizationSourceType = (typeof UTILIZATION_SOURCE_TYPES)[number];

export const UTILIZATION_TARGET_TYPES = ['invoice', 'return'] as const;
export type UtilizationTargetType = (typeof UTILIZATION_TARGET_TYPES)[number];

export interface Utilization {
  id: string;
  utilizationNumber: string;
  sourceType: UtilizationSourceType;
  sourceId: string;
  sourceLabel?: string;
  targetType: UtilizationTargetType;
  targetId: string;
  targetLabel?: string;
  amount: number;
  date: string;
  notes?: string;
  createdAt: string;
}

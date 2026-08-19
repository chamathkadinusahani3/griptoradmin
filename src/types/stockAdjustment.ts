export type StockAdjustmentReason = 'Damage' | 'Loss' | 'Theft' | 'Correction' | 'Found' | 'Stock count' | 'Other';

export interface StockAdjustment {
  id: string;
  partId: string;
  partName?: string;
  delta: number;
  previousStock: number;
  newStock: number;
  reason: StockAdjustmentReason;
  notes?: string;
  createdAt: string;
}

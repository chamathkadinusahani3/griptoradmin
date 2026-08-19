export const SUPPLIER_CLAIM_REASONS = ['Defective Goods', 'Short Shipment', 'Pricing Discrepancy', 'Damaged in Transit', 'Other'] as const;
export type SupplierClaimReason = (typeof SUPPLIER_CLAIM_REASONS)[number];
export const SETTLEMENT_METHODS = ['Cash', 'Bank Transfer', 'Store Credit', 'Applied to Future Order'] as const;
export type SettlementMethod = (typeof SETTLEMENT_METHODS)[number];

export interface SupplierClaim {
  id: string;
  claimNumber: string;
  supplierId: string;
  supplierName?: string;
  purchaseOrderId?: string;
  poNumber?: string;
  reason: SupplierClaimReason;
  description: string;
  amountClaimed: number;
  amountSettled: number;
  settlementMethod?: SettlementMethod;
  status: 'Open' | 'Accepted' | 'Rejected' | 'Settled';
  settledAt?: string;
  notes?: string;
  createdAt: string;
}

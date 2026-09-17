export interface Part {
  id: string;
  name: string;
  sku?: string;
  barcode?: string;
  category: string;
  brand?: string;
  stock: number;
  /** Live-derived — quantity outstanding on other open Sales Orders (see api/_lib/stockReservation.ts). Only populated by the /parts list. */
  reservedQty?: number;
  /** Live-derived — stock minus reservedQty. Only populated by the /parts list. */
  availableQty?: number;
  reorderAt: number;
  /** Live-derived, rule-based (reorderAt - stock, plus a recent-sales-velocity buffer) — only populated by the /parts list, and only for a part at/below its reorder point. See api/_lib/reorderSuggestion.ts. */
  suggestedReorderQty?: number;
  price: number;
  cost: number;
  /** Optional price floor — an order line selling below this is blocked/approval-gated (see api/_lib/discountGovernance.ts). Unset means no floor. */
  minSellingPrice?: number;
  /** Most relevant for batteries/parts with a real batch/lot or serial identity. Track distinct batches of the same SKU as separate Part records, same as branchId/warehouseId. */
  batchNumber?: string;
  serialNumber?: string;
  expiryDate?: string;
  unitVolume: number;
  supplierId?: string;
  supplier?: string;
  branchId?: string;
  warehouseId?: string;
}

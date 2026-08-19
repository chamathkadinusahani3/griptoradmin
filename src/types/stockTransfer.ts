export interface StockTransfer {
  id: string;
  fromPartId: string;
  fromPartName?: string;
  toPartId: string;
  toPartName?: string;
  toWarehouseId: string;
  toWarehouseName?: string;
  quantity: number;
  notes?: string;
  createdAt: string;
}

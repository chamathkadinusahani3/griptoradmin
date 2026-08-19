export interface GoodsReceivedNote {
  id: string;
  grnNumber: string;
  purchaseOrderId: string;
  poNumber?: string;
  supplierId: string;
  supplierName?: string;
  items: { partId: string; name: string; quantityReceived: number }[];
  notes?: string;
  createdAt: string;
}

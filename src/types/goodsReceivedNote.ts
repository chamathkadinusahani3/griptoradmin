export interface GoodsReceivedNote {
  id: string;
  grnNumber: string;
  purchaseOrderId: string;
  poNumber?: string;
  supplierId: string;
  supplierName?: string;
  items: { partId: string; name: string; quantityReceived: number; batchNumber?: string; serialNumber?: string; expiryDate?: string }[];
  notes?: string;
  createdAt: string;
}

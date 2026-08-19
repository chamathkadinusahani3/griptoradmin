export interface PurchaseInvoiceLine {
  partId: string;
  name: string;
  quantity: number;
  unitCost: number;
}

export interface PurchaseInvoice {
  id: string;
  purchaseInvoiceNumber: string;
  purchaseOrderId: string;
  poNumber?: string;
  supplierId: string;
  supplierName?: string;
  supplierReference?: string;
  items: PurchaseInvoiceLine[];
  subtotal: number;
  total: number;
  invoiceDate: string;
  dueDate?: string;
  matchStatus: 'Matched' | 'Discrepancy';
  discrepancyNotes: string[];
  notes?: string;
  createdAt: string;
}

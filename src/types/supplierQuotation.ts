export interface SupplierQuotationLine {
  partId?: string;
  name: string;
  quantity: number;
  unitCost: number;
}

export interface SupplierQuotation {
  id: string;
  rfqId: string;
  supplierId: string;
  supplierName?: string;
  quotationNumber: string;
  items: SupplierQuotationLine[];
  subtotal: number;
  total: number;
  validUntil?: string;
  status: 'Submitted' | 'Selected' | 'Rejected';
  notes?: string;
  createdAt: string;
}

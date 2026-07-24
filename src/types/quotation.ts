export type QuotationStatus = 'Draft' | 'Pending' | 'Approved' | 'Rejected' | 'Invoiced';

export interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface Quotation {
  id: string;
  quoteNumber: string;
  customerId: string;
  customer?: string;
  jobCardId?: string;
  vehicle: string;
  plate?: string;
  vehicleId?: string;
  items: LineItem[];
  subtotal: number;
  discountPct: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  status: QuotationStatus;
  validUntil?: string;
  notes?: string;
  createdAt: string;
}

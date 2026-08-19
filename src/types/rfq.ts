export interface RFQLine {
  partId?: string;
  name: string;
  quantity: number;
}

export interface RFQ {
  id: string;
  rfqNumber: string;
  requisitionId?: string;
  items: RFQLine[];
  supplierIds: string[];
  supplierNames?: string[];
  status: 'Open' | 'Closed';
  dueDate?: string;
  notes?: string;
  createdAt: string;
}

export const COLLECTION_METHODS = ['Cash', 'Cheque', 'Card', 'Bank Transfer', 'Other'] as const;
export type CollectionMethod = (typeof COLLECTION_METHODS)[number];

export interface CollectionRecord {
  id: string;
  salespersonId: string;
  salespersonName?: string;
  salespersonCode?: string;
  customerId: string;
  customerName?: string;
  visitId?: string;
  invoiceId?: string;
  invoiceNumber?: string;
  amount: number;
  method: CollectionMethod;
  chequeNumber?: string;
  bankAccountId?: string;
  date: string;
  notes?: string;
  createdAt: string;
}

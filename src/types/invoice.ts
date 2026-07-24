export type InvoiceStatus = 'Paid' | 'Pending' | 'Failed';

export interface Invoice {
  id: string;
  clientId: string;
  client?: string;
  plan: string;
  amount: number;
  status: InvoiceStatus;
  date: string;
}

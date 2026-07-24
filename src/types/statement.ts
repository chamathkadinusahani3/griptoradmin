import { CustomerInvoice } from './customerInvoice';

export interface CustomerStatement {
  creditLimit: number;
  creditAvailable: number | null;
  totalInvoiced: number;
  totalPaid: number;
  totalOutstanding: number;
  overdueAmount: number;
  invoices: CustomerInvoice[];
}

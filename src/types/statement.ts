import { CustomerInvoice } from './customerInvoice';
import { DealerMetrics } from './dealerMetrics';

export interface CustomerStatement extends Partial<DealerMetrics> {
  creditLimit: number;
  creditAvailable: number | null;
  totalInvoiced: number;
  totalPaid: number;
  totalOutstanding: number;
  overdueAmount: number;
  invoices: CustomerInvoice[];
}

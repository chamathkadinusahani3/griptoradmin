import { LineItem } from './quotation';

export type InvoiceStatus = 'Draft' | 'Issued' | 'Paid' | 'Void';
export type PaymentStatus = 'Unpaid' | 'Partial' | 'Paid';
export type PaymentMethod = 'Cash' | 'Card' | 'Bank Transfer' | 'Cheque' | 'Other' | 'PayHere';

export interface PaymentRecord {
  id?: string;
  amount: number;
  method: PaymentMethod;
  date: string;
  notes?: string;
  chequeNumber?: string;
  bankAccountId?: string;
  reconciled?: boolean;
  reconciledAt?: string;
}

export interface CustomerInvoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customer?: string;
  jobCardId?: string;
  quotationId?: string;
  vehicle: string;
  plate?: string;
  vehicleId?: string;
  items: LineItem[];
  subtotal: number;
  discountPct: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  status: InvoiceStatus;
  paidAmount: number;
  balance: number;
  paymentStatus: PaymentStatus;
  paymentHistory: PaymentRecord[];
  dueDate?: string;
  notes?: string;
  createdAt: string;
}

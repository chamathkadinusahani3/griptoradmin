import { Customer } from './customer';
import { DealerMetrics } from './dealerMetrics';

/** A corporate Customer plus its live-computed balance + dealer-tracking fields — the bulk equivalent of CustomerStatement, one row per account. */
export interface CorporateAccount extends Customer, DealerMetrics {
  totalOutstanding: number;
  overdueAmount: number;
  creditAvailable: number | null;
}

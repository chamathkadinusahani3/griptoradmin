import { Customer } from './customer';

/** A corporate Customer plus its live-computed balance fields — the bulk equivalent of CustomerStatement, one row per account. */
export interface CorporateAccount extends Customer {
  totalOutstanding: number;
  overdueAmount: number;
  creditAvailable: number | null;
}

export type CustomerType = 'individual' | 'corporate';

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone?: string;
  vehicles: string[];
  tags: string[];
  visits: number;
  lastVisit?: string;
  loyaltyPoints: number;
  totalSpend: number;
  type: CustomerType;
  contactPerson?: string;
  creditLimit: number;
  discountPct: number;
  creditPeriodDays: number;
  hasPortalAccount: boolean;
}

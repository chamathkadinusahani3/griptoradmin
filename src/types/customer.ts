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
  /** Which module this customer was created under (a MODULES id, e.g. 'gms' vs 'crm'), or 'booking-system' for public-booking auto-create. Unset for older customers or portal self-registration. */
  sourceModule?: string;
}

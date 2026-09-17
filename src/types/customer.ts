export type CustomerType = 'individual' | 'corporate' | 'retail' | 'wholesale' | 'dealer';
export type CustomerStatus = 'Active' | 'Inactive' | 'Blocked';
// Types that carry the same credit-relationship implications 'corporate'
// always did (credit limit/discount/period, dealer metrics) — mirrors
// api/_lib/creditDiscipline.ts's CREDIT_ELIGIBLE_CUSTOMER_TYPES.
export const CREDIT_ELIGIBLE_CUSTOMER_TYPES: readonly CustomerType[] = ['corporate', 'wholesale', 'dealer'];

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
  billingAddress?: string;
  shippingAddress?: string;
  taxNumber?: string;
  status: CustomerStatus;
  hasPortalAccount: boolean;
  /** Only meaningful once the tenant has Price Lists enabled in Settings. */
  defaultPriceListId?: string;
  defaultPriceListName?: string;
  /** Which module this customer was created under (a MODULES id, e.g. 'gms' vs 'crm'), or 'booking-system' for public-booking auto-create. Unset for older customers or portal self-registration. */
  sourceModule?: string;
}

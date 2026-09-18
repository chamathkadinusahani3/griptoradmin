import { Attachment } from './attachment';

export const BUSINESS_TYPES = ['Sole Proprietorship', 'Partnership', 'Private Limited', 'Public Limited', 'Other'] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

export const DEALER_CATEGORIES = ['Retailer', 'Wholesaler', 'Distributor', 'Tyre Shop', 'Garage', 'Fleet', 'Other'] as const;
export type DealerCategory = (typeof DEALER_CATEGORIES)[number];

export const OWNER_ROLES = ['Owner', 'Director', 'Partner'] as const;
export type OwnerRole = (typeof OWNER_ROLES)[number];

export const SIGNATORY_TYPES = ['Single', 'Joint'] as const;
export type SignatoryType = (typeof SIGNATORY_TYPES)[number];

export const PAYMENT_TYPES = ['Cash', 'Credit', 'Bank Transfer', 'Cheque'] as const;
export type PaymentType = (typeof PAYMENT_TYPES)[number];

export const CUSTOMER_SEGMENTS = ['Passenger', 'SUV', 'Truck', 'Bus', 'Commercial', 'Mixed'] as const;
export type CustomerSegment = (typeof CUSTOMER_SEGMENTS)[number];

export const DEALER_DOCUMENT_TYPES = [
  'Business Registration Certificate',
  'TIN Certificate',
  'VAT Certificate',
  'Owner NIC/Passport',
  'Proof of Business Address',
  'Bank Statement',
  'Bank Confirmation',
  'Authorized Signatory Document',
  'Credit Application',
  'Dealer Agreement',
  'Other',
] as const;
export type DealerDocumentType = (typeof DEALER_DOCUMENT_TYPES)[number];

// Phase 4 — the credit-approval workflow. 'Rejected' is a side-terminal
// reachable from any state before 'Activated', not a forward step itself.
export const DEALER_APPROVAL_STATUSES = [
  'New Dealer',
  'Credit Application',
  'Documents Verified',
  'Credit Review',
  'Manager Approval',
  'Finance Approval',
  'Activated',
  'Rejected',
] as const;
export type DealerApprovalStatus = (typeof DEALER_APPROVAL_STATUSES)[number];

export interface MainContact {
  person?: string;
  designation?: string;
  mobile?: string;
  landline?: string;
  email?: string;
  whatsapp?: string;
  website?: string;
}

export interface SecondaryContact {
  name?: string;
  phone?: string;
  email?: string;
}

export interface RegisteredAddress {
  line1?: string;
  line2?: string;
  city?: string;
  district?: string;
  province?: string;
  postalCode?: string;
}

export interface BusinessAddress {
  sameAsRegistered: boolean;
  line1?: string;
  city?: string;
  district?: string;
}

export interface DerivedAddress {
  sameAsBusiness: boolean;
  address?: string;
}

export interface Owner {
  name: string;
  nicOrPassport?: string;
  designation?: string;
  mobile?: string;
  email?: string;
  address?: string;
  role: OwnerRole;
}

export interface Signatory {
  name: string;
  designation?: string;
  nic?: string;
  mobile?: string;
  signatureUrl?: string;
  signatureType: SignatoryType;
  active: boolean;
}

export interface DealerBankAccount {
  bankName: string;
  branch?: string;
  accountName?: string;
  accountNumber?: string;
  accountType?: string;
  bankCode?: string;
}

export interface BusinessProfile {
  numberOutlets?: number;
  numberEmployees?: number;
  numberSalesStaff?: number;
  numberVehicles?: number;
  approxMonthlyPurchase?: number;
  approxAnnualPurchase?: number;
  brandsSelling: string[];
  competitorBrands: string[];
  mainTyreSizes: string[];
  customerSegment?: CustomerSegment;
}

export interface DealerDocument {
  documentType: DealerDocumentType;
  attachment: Attachment;
}

export interface DealerProfile {
  id: string;
  customerId: string;
  dealerCode: string;
  legalBusinessName?: string;
  tradingName?: string;
  businessRegistrationNo?: string;
  businessType?: BusinessType;
  yearEstablished?: number;
  dealerCategory?: DealerCategory;
  mainContact: MainContact;
  accountsContact: SecondaryContact;
  purchasingContact: SecondaryContact;
  registeredAddress: RegisteredAddress;
  businessAddress: BusinessAddress;
  billingAddress: DerivedAddress;
  deliveryAddress: DerivedAddress;
  tin?: string;
  vatRegistered: boolean;
  vatNumber?: string;
  svatNumber?: string;
  taxType?: string;
  taxExemptionStatus?: string;
  owners: Owner[];
  signatories: Signatory[];
  region?: string;
  branchId?: string;
  dealerClass?: string;
  dealerGroup?: string;
  paymentType?: PaymentType;
  dealerBankAccounts: DealerBankAccount[];
  businessProfile: BusinessProfile;
  documents: DealerDocument[];
  /** Undefined for a DealerProfile created before Phase 4 shipped — treat as "grandfathered / already active", not as 'New Dealer'. */
  approvalStatus?: DealerApprovalStatus;
  requestedCreditLimit?: number;
  recommendedCreditLimit?: number;
  approvedCreditLimit?: number;
  creditTerms?: string;
  approvedBy?: string;
  approvedAt?: string;
  reviewDate?: string;
  rejectionReason?: string;
  createdAt: string;
}

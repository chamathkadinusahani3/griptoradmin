export interface WarrantyClaim {
  id: string;
  claimNumber: string;
  customerId: string;
  customerName?: string;
  jobCardId?: string;
  partId?: string;
  partName?: string;
  issueDescription: string;
  providedDate?: string;
  warrantyPeriodDays?: number;
  withinWarranty: boolean | null;
  status: 'Open' | 'Approved' | 'Rejected' | 'Resolved';
  resolution?: string;
  resolvedAt?: string;
  notes?: string;
  createdAt: string;
}

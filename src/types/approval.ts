export type ApprovalType = 'Discount Authorization' | 'Refund Request' | 'Credit Limit Override' | 'Warranty Claim' | 'Other';
export type ApprovalStatus = 'Pending' | 'Approved' | 'Rejected';

export interface Approval {
  id: string;
  type: ApprovalType;
  subject: string;
  amount?: number;
  requestedBy: string;
  requestedByName?: string;
  status: ApprovalStatus;
  respondedBy?: string;
  respondedByName?: string;
  respondedAt?: string;
  notes?: string;
  createdAt: string;
}

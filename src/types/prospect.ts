export const PROSPECT_SOURCES = ['Referral', 'Walk-in', 'Phone', 'Website', 'Social Media', 'Other'] as const;
export type ProspectSource = (typeof PROSPECT_SOURCES)[number];
export type ProspectStatus = 'New' | 'Contacted' | 'Qualified' | 'Converted' | 'Lost';

export interface Prospect {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  source?: ProspectSource;
  status: ProspectStatus;
  assignedTo?: string;
  assignedToName?: string;
  convertedCustomerId?: string;
  lostReason?: string;
  notes?: string;
  createdAt: string;
}

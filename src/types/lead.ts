export type LeadStatus = 'New' | 'Contacted' | 'Converted';

export interface Lead {
  id: string;
  name: string;
  email: string;
  company?: string;
  businessType?: string;
  message: string;
  status: LeadStatus;
  date: string;
}

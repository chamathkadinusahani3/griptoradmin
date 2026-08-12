export type ComplaintDirection = 'customer' | 'supplier';
export type ComplaintCategory = 'Quality' | 'Service' | 'Billing' | 'Delivery' | 'Communication' | 'Other';
export type ComplaintPriority = 'Low' | 'Medium' | 'High' | 'Urgent';
export type ComplaintStatus = 'Open' | 'In Progress' | 'Resolved' | 'Closed';

export interface Complaint {
  id: string;
  direction: ComplaintDirection;
  customerId?: string;
  supplierId?: string;
  party?: string;
  complaintNumber: string;
  category: ComplaintCategory;
  subject: string;
  description: string;
  priority: ComplaintPriority;
  status: ComplaintStatus;
  resolution?: string;
  resolvedAt?: string;
  jobCardId?: string;
  purchaseOrderId?: string;
  createdAt: string;
}

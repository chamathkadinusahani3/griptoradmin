export const COLLECTION_TASK_STATUSES = ['Pending', 'Contacted', 'Promise to Pay', 'Collected', 'Failed'] as const;
export type CollectionTaskStatus = (typeof COLLECTION_TASK_STATUSES)[number];

export interface CollectionTask {
  id: string;
  customerId: string;
  customerName: string;
  outstandingAmountAtCreation: number;
  assignedTo: string;
  assignedToName?: string;
  createdBy: string;
  createdByName?: string;
  status: CollectionTaskStatus;
  contactDate?: string;
  promiseDate?: string;
  promiseAmount?: number;
  collectedAmount?: number;
  failReason?: string;
  notes?: string;
  createdAt: string;
}

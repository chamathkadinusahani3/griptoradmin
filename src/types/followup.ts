export const FOLLOWUP_TYPES = ['Call', 'Email', 'Meeting', 'Other'] as const;
export type FollowupType = (typeof FOLLOWUP_TYPES)[number];

export interface Followup {
  id: string;
  customerId?: string;
  prospectId?: string;
  subjectName: string;
  dueDate: string;
  type: FollowupType;
  assignedTo?: string;
  assignedToName?: string;
  status: 'Pending' | 'Completed' | 'Cancelled';
  completedAt?: string;
  notes?: string;
  createdAt: string;
}

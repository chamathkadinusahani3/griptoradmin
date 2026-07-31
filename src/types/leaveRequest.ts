export const LEAVE_TYPES = ['Annual', 'Sick', 'Unpaid', 'Other'] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];
export type LeaveStatus = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';

export interface LeaveRequest {
  id: string;
  requestedBy: string;
  requestedByName?: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  reason?: string;
  status: LeaveStatus;
  respondedBy?: string;
  respondedByName?: string;
  respondedAt?: string;
  responseNote?: string;
  createdAt: string;
}

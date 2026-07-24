export type CallDirection = 'Inbound' | 'Outbound';
export type CallStatus = 'Open' | 'Resolved' | 'Escalated';

export interface CallLog {
  id: string;
  customerId: string;
  customer?: string;
  direction: CallDirection;
  reason: string;
  status: CallStatus;
  durationMinutes?: number;
  notes?: string;
  followUpDue?: string;
  reminderId?: string;
  createdAt: string;
}

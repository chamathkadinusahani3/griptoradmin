export type ReminderChannel = 'SMS' | 'WhatsApp' | 'Email';
export type ReminderStatus = 'Scheduled' | 'Sent' | 'Failed';

export interface Reminder {
  id: string;
  customerId: string;
  customer?: string;
  vehicle?: string;
  type: string;
  channel: ReminderChannel;
  status: ReminderStatus;
  scheduledFor: string;
}

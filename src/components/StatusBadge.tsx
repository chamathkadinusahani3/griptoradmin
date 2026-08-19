




import React from 'react';
import { Badge } from './ui/Badge';

const map: Record<string, 'gray' | 'green' | 'blue' | 'teal' | 'amber' | 'red' | 'purple'> = {
  // clients
  Active: 'green',
  Trial: 'blue',
  Suspended: 'red',
  // leads
  New: 'blue',
  Contacted: 'amber',
  Converted: 'green',
  // invoices
  Paid: 'green',
  Pending: 'amber',
  Failed: 'red',
  // tickets
  Open: 'blue',
  Resolved: 'green',
  Urgent: 'red',
  High: 'amber',
  Medium: 'blue',
  Low: 'gray',
  // job cards / bookings
  'In Progress': 'blue',
  'Awaiting Parts': 'amber',
  Completed: 'green',
  // bookings
  Waiting: 'purple',
  // reminders
  Scheduled: 'blue',
  Sent: 'green',
  // inspections
  Pass: 'green',
  Advisory: 'amber',
  Fail: 'red',
  // tech
  Available: 'green',
  Busy: 'amber',
  'On Break': 'blue',
  'Off Duty': 'gray',
  Invited: 'amber',
  // purchase orders / payroll runs
  Ordered: 'blue',
  'Partially Received': 'amber',
  Received: 'green',
  Cancelled: 'red',
  Finalized: 'blue',
  // complaints
  Closed: 'gray'
};

export function StatusBadge({ status, dot = true }: {status: string;dot?: boolean;}) {
  return (
    <Badge tone={map[status] || 'gray'} dot={dot}>
      {status}
    </Badge>);

}
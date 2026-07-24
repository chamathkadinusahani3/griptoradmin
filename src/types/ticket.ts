export type TicketPriority = 'Low' | 'Medium' | 'High' | 'Urgent';
export type TicketStatus = 'Open' | 'Pending' | 'Resolved';

export interface TicketMessage {
  author: string;
  role: 'client' | 'agent';
  text: string;
  time: string;
}

export interface Ticket {
  id: string;
  clientId: string;
  client?: string;
  subject: string;
  priority: TicketPriority;
  status: TicketStatus;
  assignee: string;
  thread: TicketMessage[];
  updated: string;
}

export interface TimelineEvent {
  type: 'job-card' | 'invoice' | 'complaint' | 'call-log';
  id: string;
  date: string;
  title: string;
  status: string;
  detail?: string;
}

export interface CustomerHistory {
  vehicles: { id: string; label: string; plate?: string; make?: string; model?: string; year?: number }[];
  timeline: TimelineEvent[];
  summary: {
    jobCardCount: number;
    invoiceCount: number;
    complaintCount: number;
    callLogCount: number;
  };
}

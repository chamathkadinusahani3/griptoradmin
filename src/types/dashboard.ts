export type ActivityType = 'signup' | 'churn' | 'ticket' | 'payment';

export interface ActivityItem {
  id: string;
  type: ActivityType;
  text: string;
  time: string;
}

export interface DashboardSummary {
  stats: {
    totalClients: number;
    mrr: number;
    activeTrials: number;
    churnRatePct: number;
  };
  signupSeries: { month: string; signups: number }[];
  mrrSeries: { month: string; mrr: number }[];
  recentActivity: ActivityItem[];
}

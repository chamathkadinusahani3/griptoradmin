export interface TenantDashboardSummary {
  stats: {
    openJobs: number;
    lowStock: number;
    upcomingReminders: number;
    revenueThisMonth: number;
  };
}

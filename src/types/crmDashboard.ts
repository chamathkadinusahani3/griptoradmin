export interface CrmDashboardFollowupItem {
  id: string;
  subjectName: string;
  dueDate: string;
  type: string;
}

export interface CrmDashboardComplaintItem {
  id: string;
  complaintNumber: string;
  subject: string;
  priority: string;
  status: string;
  createdAt: string;
}

export interface CrmDashboardSummary {
  prospectFunnel: {
    total: number;
    new: number;
    contacted: number;
    qualified: number;
    converted: number;
    lost: number;
  };
  followups: {
    overdueCount: number;
    dueTodayCount: number;
    upcomingCount: number;
    overdue: CrmDashboardFollowupItem[];
    dueToday: CrmDashboardFollowupItem[];
  };
  complaints: {
    openCount: number;
    recent: CrmDashboardComplaintItem[];
  };
}

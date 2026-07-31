export interface PerformanceReview {
  id: string;
  employeeUserId: string;
  employeeName?: string;
  reviewedBy: string;
  reviewedByName?: string;
  reviewDate: string;
  rating: number;
  feedback: string;
  createdAt: string;
}

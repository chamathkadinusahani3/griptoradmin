export interface Timesheet {
  id: string;
  technicianId?: string;
  employeeId?: string;
  subjectName: string;
  periodStart: string;
  periodEnd: string;
  totalHours: number;
  status: 'Submitted' | 'Approved' | 'Rejected';
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  notes?: string;
  createdAt: string;
}

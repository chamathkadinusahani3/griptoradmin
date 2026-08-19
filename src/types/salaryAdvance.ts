export interface SalaryAdvance {
  id: string;
  advanceNumber: string;
  technicianId?: string;
  employeeId?: string;
  subjectName: string;
  amount: number;
  reason?: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  paymentMethod?: 'Cash' | 'Card' | 'Bank Transfer' | 'Cheque' | 'Other';
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  rejectionReason?: string;
  notes?: string;
  createdAt: string;
}

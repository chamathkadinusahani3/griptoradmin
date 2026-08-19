export type PayrollRunStatus = 'Draft' | 'Finalized' | 'Paid';

export interface PayrollLine {
  technicianId?: string;
  employeeId?: string;
  technicianName: string;
  hourlyRate?: number;
  hoursWorked: number;
  grossPay: number;
  missingRate: boolean;
}

export interface PayrollRun {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: PayrollRunStatus;
  lines: PayrollLine[];
  totalAmount: number;
  finalizedAt?: string;
  paidAt?: string;
  createdAt: string;
}

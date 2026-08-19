export interface Payslip {
  id: string;
  payrollRunId: string;
  technicianId?: string;
  employeeId?: string;
  subjectName: string;
  periodStart: string;
  periodEnd: string;
  hourlyRate?: number;
  hoursWorked: number;
  grossPay: number;
  missingRate: boolean;
  createdAt: string;
}

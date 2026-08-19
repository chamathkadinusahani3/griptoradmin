export interface WorkshopReport {
  range: { from: string; to: string };
  bayCount: number;
  bayUtilizationPct: number;
  jobsWithBayAssigned: number;
  totalJobs: number;
  totalHoursWorked: number;
  technicianAttendance: { technician: string; daysWorked: number; hoursWorked: number }[];
}

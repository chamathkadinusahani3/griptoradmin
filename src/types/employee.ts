export const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Contract'] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export interface Employee {
  userId: string;
  name: string;
  email: string;
  tenantRole: string;
  hasProfile: boolean;
  dateOfBirth?: string;
  address?: string;
  nationalId?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  hireDate?: string;
  employmentType: EmploymentType;
  notes?: string;
  hourlyRate?: number;
  active: boolean;
  departmentId?: string;
  /** The Employee document's own id (only present once hasProfile is true) — this, not userId, is what Payroll/Timesheets/Salary Advances reference. */
  employeeId?: string;
}

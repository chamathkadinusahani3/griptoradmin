export type TechStatus = 'Available' | 'Busy' | 'On Break' | 'Off Duty';
export type AttendanceStatus = 'active' | 'on_break' | 'off';

export interface Technician {
  id: string;
  name: string;
  specialty: string;
  status: TechStatus;
  avatar?: string;
  activeJobs: number;
  completedToday: number;
  attendanceStatus: AttendanceStatus;
  clockInAt?: string;
  branchId?: string;
  hourlyRate?: number;
  maxConcurrentJobs: number;
  active: boolean;
}

export interface AttendanceHistoryEntry {
  date: string;
  status: 'active' | 'on_break' | 'off';
  clockInAt?: string;
  clockOutAt?: string;
  breakCount: number;
  hoursWorked: number | null;
}

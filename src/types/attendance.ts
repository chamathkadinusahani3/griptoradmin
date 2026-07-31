export type AttendanceAction = 'clock_in' | 'start_break' | 'end_break' | 'clock_out';
export type AttendanceStatus = 'active' | 'on_break' | 'off';

export interface MyAttendance {
  status: AttendanceStatus;
  clockInAt?: string;
  clockOutAt?: string;
  hoursWorked: number | null;
}

export interface TeamAttendanceRow {
  subjectType: 'Technician' | 'Staff';
  subjectId: string;
  name?: string;
  status: AttendanceStatus;
  clockInAt?: string;
  clockOutAt?: string;
  hoursWorked: number | null;
}

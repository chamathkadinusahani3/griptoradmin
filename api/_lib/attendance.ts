import { AttendanceDoc } from './models/Attendance.js';

/**
 * Hours actually worked on one Attendance day: clock-out minus clock-in,
 * minus every closed break span. Returns null for a day that never clocked
 * out (nothing to compute yet). Originally lived as a local, unexported
 * helper in api/technicians/[id]/attendance-history.ts — extracted here so
 * Payroll (api/payroll-runs/index.ts) can reuse the exact same money-relevant
 * math instead of re-deriving it, same "one shared function" discipline as
 * recordCustomerInvoicePayment surviving the Stripe→PayHere swap unchanged.
 */
export function computeHoursWorked(record: AttendanceDoc): number | null {
  if (!record.clockInAt || !record.clockOutAt) return null;
  const totalMs = record.clockOutAt.getTime() - record.clockInAt.getTime();
  const breakMs = record.breakLogs.reduce((sum, b) => {
    if (!b.endedAt) return sum; // an unclosed break shouldn't happen on a clocked-out day, but don't let it produce a negative total if it does
    return sum + (b.endedAt.getTime() - b.startedAt.getTime());
  }, 0);
  return Math.round(((totalMs - breakMs) / 3600000) * 100) / 100;
}

export type AttendanceAction = 'clock_in' | 'start_break' | 'end_break' | 'clock_out';
export const ATTENDANCE_ACTIONS: AttendanceAction[] = ['clock_in', 'start_break', 'end_break', 'clock_out'];

export interface AttendanceStateLike {
  status: string;
  clockInAt?: Date | null;
  clockOutAt?: Date | null;
  breakLogs: { startedAt: Date; endedAt?: Date | null }[];
}

/**
 * Applies one clock action to an existing attendance-day document (or null
 * if this subject hasn't clocked in yet today), mutating it in place —
 * originally inline in api/_lib/routes/technicians/[id]/attendance.ts,
 * extracted here so the newer self-service flow (attendance/me.ts, any
 * staff User, not just Technician resources) reuses the exact same state
 * machine instead of a second copy that could drift. `doc` accepts a real
 * Mongoose document (mutate-then-.save()) or a plain object — both support
 * direct property assignment and Array#push identically for this shape.
 * Returns an error message if the action is invalid for the current state
 * (e.g. clocking out before clocking in), or null on success. When `doc` is
 * null and the action is 'clock_in', there's nothing to mutate — the caller
 * is responsible for creating the new day's record itself.
 */
export function applyAttendanceAction(doc: AttendanceStateLike | null, action: AttendanceAction, now: Date): { error: string } | null {
  if (!doc && action !== 'clock_in') {
    return { error: 'Clock in first' };
  }
  if (action === 'clock_in') {
    if (doc) {
      doc.status = 'active';
      doc.clockInAt = now;
    }
    return null;
  }
  if (action === 'start_break') {
    doc!.status = 'on_break';
    doc!.breakLogs.push({ startedAt: now });
    return null;
  }
  if (action === 'end_break') {
    const open = doc!.breakLogs.find((b) => !b.endedAt);
    if (!open) return { error: 'No break is currently open' };
    open.endedAt = now;
    doc!.status = 'active';
    return null;
  }
  // clock_out
  doc!.status = 'off';
  doc!.clockOutAt = now;
  return null;
}

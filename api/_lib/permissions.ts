// The tenant-side permission taxonomy — every key here is grounded 1:1 in a
// real, currently-existing endpoint/gate (see the RBAC plan for the file-by-
// file inventory this was derived from). Nothing here is invented ahead of
// an actual access-control boundary in the code.

// Resources with a symmetric view/manage split: today these are gated by a
// flat requireTenant (any staff), Phase 2 adds a real permission check.
const PAIRED_RESOURCES = [
  'job-cards',
  'bookings',
  'bays',
  'inspections',
  'technicians',
  'services',
  'customers',
  'reminders',
  'feedback',
  'call-logs',
  'loyalty-rewards',
  'message-templates',
  'recruitment', // job-openings + candidates, one pipeline
  'customer-invoices',
  'quotations',
  'expenses',
  'parts',
  'purchase-orders',
  'suppliers',
  'sales',
  'sms',
  'branches',
  'payroll',
  'bank-accounts',
  'returns',
  'complaints',
  'departments',
  'prospects',
  'followups',
] as const;

// View-only resources — either genuinely read-only today (reports) or where
// the "manage" side is one of the standalone actions below instead (staff
// edits employees via employees:edit, not employees:manage; leave-requests
// creation/cancellation is self-service and stays ungated, only responding
// to someone else's request is gated).
const VIEW_ONLY_RESOURCES = ['reports', 'employees', 'approvals', 'performance-reviews', 'leave-requests'] as const;

// Standalone actions — each matches an exact existing requireTenantManager
// gate or the one hand-rolled inline exception (leave-requests/[id].ts).
// These are the permissions a non-manager seeded role (Technician/Cashier/
// Sales Executive) does NOT get by default, reproducing today's real
// Owner/Manager-only boundary exactly.
export const STANDALONE_PERMISSIONS = [
  'staff:invite',
  'staff:edit',
  'staff:remove',
  'approvals:respond',
  'employees:edit',
  'performance-reviews:create',
  'settings:edit',
  'billing:manage',
  'leave-requests:respond',
  'roles:manage',
] as const;

// "Team view" of attendance (seeing/acting on OTHER staff's records) is
// gated; clocking your own in/out (attendance/me.ts) stays unrestricted
// self-service for every role, same as raising your own leave request.
export const ATTENDANCE_VIEW_TEAM = 'attendance:view-team';

export const PERMISSIONS: readonly string[] = [
  ...PAIRED_RESOURCES.flatMap((r) => [`${r}:view`, `${r}:manage`]),
  ...VIEW_ONLY_RESOURCES.map((r) => `${r}:view`),
  ATTENDANCE_VIEW_TEAM,
  ...STANDALONE_PERMISSIONS,
];

export type Permission = (typeof PERMISSIONS)[number];

export function isValidPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}

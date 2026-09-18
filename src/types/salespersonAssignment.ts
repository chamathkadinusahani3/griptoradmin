export const VISIT_FREQUENCIES = ['Daily', 'Weekly', 'Biweekly', 'Monthly'] as const;
export type VisitFrequency = (typeof VISIT_FREQUENCIES)[number];

export const ASSIGNMENT_PRIORITIES = ['High', 'Medium', 'Low'] as const;
export type AssignmentPriority = (typeof ASSIGNMENT_PRIORITIES)[number];

export const VISIT_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
export type VisitDay = (typeof VISIT_DAYS)[number];

export interface SalespersonAssignment {
  id: string;
  salespersonId: string;
  salespersonName?: string;
  salespersonCode?: string;
  /** The tenant User (login) this salesperson resolves to, when it has one — see api/_lib/salespersonUserLink.ts. */
  salespersonUserId?: string;
  customerId: string;
  customerName?: string;
  territory?: string;
  routeId?: string;
  routeName?: string;
  visitFrequency: VisitFrequency;
  preferredVisitDay?: VisitDay;
  priority: AssignmentPriority;
  active: boolean;
  createdAt: string;
}

export const SALES_VISIT_STATUSES = ['Pending', 'In Progress', 'Completed', 'Cancelled', 'Rescheduled'] as const;
export type SalesVisitStatus = (typeof SALES_VISIT_STATUSES)[number];

export interface SalesVisit {
  id: string;
  salespersonId: string;
  salespersonName?: string;
  salespersonCode?: string;
  customerId: string;
  customerName?: string;
  assignmentId?: string;
  visitDate: string;
  purpose?: string;
  notes?: string;
  status: SalesVisitStatus;
  checkInAt?: string;
  checkInLat?: number;
  checkInLng?: number;
  checkOutAt?: string;
  checkOutLat?: number;
  checkOutLng?: number;
  durationMinutes?: number;
  completedAt?: string;
  cancelledAt?: string;
  rescheduledFrom?: string;
  tripDistanceKm: number | null;
  estimatedFuelCost: number | null;
  createdAt: string;
}

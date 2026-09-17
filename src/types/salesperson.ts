export interface Salesperson {
  id: string;
  code: string;
  name: string;
  employeeId?: string;
  employeeName?: string;
  mobile?: string;
  email?: string;
  territory?: string;
  routeId?: string;
  routeName?: string;
  target: number;
  /** Revenue-based %, 0 = no commission configured. */
  commissionPct: number;
  status: 'Active' | 'Inactive';
  gpsTrackingEnabled: boolean;
  createdAt: string;
}

export interface SfRouteReportRow {
  routeId: string;
  code: string;
  name: string;
  territory?: string;
  salespersonName?: string;
  driverName?: string;
  status: 'Active' | 'Inactive';
  deliveryCount: number;
  pendingVolume: number;
}

export interface SfRouteReport {
  asOf: string;
  summary: {
    totalRoutes: number;
    activeRoutes: number;
    routesWithNoDeliveries: number;
  };
  rows: SfRouteReportRow[];
}

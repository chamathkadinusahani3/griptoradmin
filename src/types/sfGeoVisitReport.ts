export interface SfGeoVisitReportRow {
  visitId: string;
  salespersonName: string;
  customerName: string;
  checkInAt?: string;
  checkOutAt?: string;
  geoTagged: boolean;
  tripDistanceKm: number | null;
}

export interface SfGeoVisitReport {
  range: { from: string; to: string };
  summary: {
    checkedInCount: number;
    geoTaggedCount: number;
    geoTaggedPct: number;
    avgTripDistanceKm: number | null;
  };
  rows: SfGeoVisitReportRow[];
}

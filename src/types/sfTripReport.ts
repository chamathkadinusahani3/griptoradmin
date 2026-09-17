export interface SfTripReportRow {
  visitId: string;
  salespersonName: string;
  customerName: string;
  visitDate: string;
  tripDistanceKm: number | null;
  estimatedFuelCost: number | null;
}

export interface SfTripReport {
  range: { from: string; to: string };
  summary: {
    visitsWithDistance: number;
    totalDistanceKm: number;
    totalFuelCost: number;
    visitsWithFuelEstimate: number;
    avgDistanceKm: number;
  };
  rows: SfTripReportRow[];
}

export interface SfPendingDeliveryReportRow {
  salesOrderId: string;
  salesOrderNumber: string;
  customerName: string;
  outstandingItemCount: number;
  totalVolume: number;
  suggestedVehicleType: string | null;
  assignmentStatus: string;
  routeName?: string;
  driverName?: string;
}

export interface SfPendingDeliveryReport {
  asOf: string;
  summary: {
    totalPending: number;
    totalVolume: number;
    unassignedCount: number;
  };
  rows: SfPendingDeliveryReportRow[];
}

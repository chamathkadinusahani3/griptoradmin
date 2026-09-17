export interface SfVehicleReportRow {
  vehicleId: string;
  vehicleNumber: string;
  vehicleType: string;
  driverName?: string;
  status: 'Active' | 'Inactive' | 'In Maintenance';
  fuelEfficiency: number;
  deliveriesAssigned: number;
  deliveriesCompleted: number;
}

export interface SfVehicleReport {
  range: { from: string; to: string };
  summary: {
    totalVehicles: number;
    activeVehicles: number;
    avgDeliveriesPerVehicle: number;
  };
  rows: SfVehicleReportRow[];
}

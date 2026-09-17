export interface FleetVehicle {
  id: string;
  vehicleNumber: string;
  vehicleType: string;
  capacity?: number;
  capacityUnit: string;
  driverId?: string;
  driverName?: string;
  status: 'Active' | 'Inactive' | 'In Maintenance';
  fuelEfficiency: number;
  createdAt: string;
}

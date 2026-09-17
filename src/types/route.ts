export interface DeliveryRoute {
  id: string;
  code: string;
  name: string;
  territory?: string;
  towns: string[];
  postalCodes: string[];
  salespersonId?: string;
  salespersonName?: string;
  driverId?: string;
  driverName?: string;
  status: 'Active' | 'Inactive';
  createdAt: string;
}

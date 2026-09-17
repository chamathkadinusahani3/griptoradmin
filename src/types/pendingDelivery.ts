export const DELIVERY_ASSIGNMENT_STATUSES = ['Pending', 'Assigned', 'In Transit', 'Delivered', 'Failed', 'Cancelled'] as const;
export type DeliveryAssignmentStatus = (typeof DELIVERY_ASSIGNMENT_STATUSES)[number];

export interface PendingDeliveryItem {
  partId: string;
  name: string;
  orderedQuantity: number;
  deliveredQuantity: number;
  outstandingQuantity: number;
}

export interface DeliveryAssignmentInfo {
  id: string;
  routeId?: string;
  routeName?: string;
  driverId?: string;
  driverName?: string;
  vehicleId?: string;
  vehicleNumber?: string;
  status: DeliveryAssignmentStatus;
  deliveryDate?: string;
  notes?: string;
}

export interface PendingDelivery {
  salesOrderId: string;
  salesOrderNumber: string;
  customerId: string;
  customerName?: string;
  customerPhone?: string;
  orderStatus: 'Confirmed' | 'Partially Fulfilled';
  orderCreatedAt: string;
  items: PendingDeliveryItem[];
  totalVolume: number;
  suggestedVehicleType: string | null;
  assignment: DeliveryAssignmentInfo | null;
}

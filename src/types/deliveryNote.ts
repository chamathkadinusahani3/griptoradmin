export interface DeliveryNote {
  id: string;
  deliveryNoteNumber: string;
  salesOrderId: string;
  salesOrderNumber?: string;
  customerId: string;
  customerName?: string;
  items: { partId: string; name: string; quantityDelivered: number }[];
  notes?: string;
  createdAt: string;
}

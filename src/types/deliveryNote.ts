export type DeliveryNoteStatus = 'Pending' | 'Picked' | 'Packed' | 'Confirmed' | 'Cancelled';

export interface DeliveryNote {
  id: string;
  deliveryNoteNumber: string;
  salesOrderId: string;
  salesOrderNumber?: string;
  customerId: string;
  customerName?: string;
  items: { partId: string; name: string; quantityDelivered: number }[];
  notes?: string;
  status: DeliveryNoteStatus;
  confirmedAt?: string;
  receiverName?: string;
  receiverPhone?: string;
  signatureDataUrl?: string;
  photoDataUrl?: string;
  createdAt: string;
}

export interface RequisitionLine {
  partId?: string;
  name: string;
  quantity: number;
  estimatedUnitCost?: number;
}

export type PurchaseRequisitionStatus = 'Pending' | 'Approved' | 'Rejected' | 'Converted';

export interface PurchaseRequisition {
  id: string;
  requisitionNumber: string;
  requestedBy: string;
  requestedByName?: string;
  items: RequisitionLine[];
  estimatedTotal: number;
  status: PurchaseRequisitionStatus;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  notes?: string;
  createdAt: string;
}

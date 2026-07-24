export type InspectionResult = 'Pass' | 'Advisory' | 'Fail';
export type ApprovalStatus = 'not_required' | 'pending' | 'approved' | 'rejected';

export interface InspectionMedia {
  url: string;
  type: 'image' | 'video';
  uploadedAt: string;
}

export interface Inspection {
  id: string;
  customerId: string;
  customer?: string;
  technicianId: string;
  technician?: string;
  jobCardId?: string;
  vehicle: string;
  plate?: string;
  result: InspectionResult;
  media: InspectionMedia[];
  items: number;
  notes?: string;
  additionalCost?: number;
  approvalStatus: ApprovalStatus;
  approvalToken?: string;
  approvalRequestedAt?: string;
  approvalRespondedAt?: string;
  date: string;
}

/** Shape returned by the public /api/public/inspections/:token endpoint — a deliberately smaller subset. */
export interface PublicInspection {
  vehicle: string;
  plate?: string;
  result: InspectionResult;
  media: InspectionMedia[];
  notes?: string;
  additionalCost?: number;
  approvalStatus: ApprovalStatus;
  date: string;
}

export type JobStatus = 'New' | 'In Progress' | 'Awaiting Parts' | 'Completed';

export interface ChecklistItem {
  label: string;
  done: boolean;
}

export interface PartUsed {
  partId: string;
  name: string;
  price: number;
  qty: number;
}

export interface JobCard {
  id: string;
  customerId: string;
  customer?: string;
  vehicle: string;
  plate?: string;
  vehicleId?: string;
  service?: string;
  technicianId: string;
  technician?: string;
  estimate: number;
  status: JobStatus;
  checklist: ChecklistItem[];
  bayId?: string;
  bay?: string;
  startedAt?: string;
  completedAt?: string;
  branchId?: string;
  partsUsed: PartUsed[];
  laborCost: number;
  createdAt: string;
}

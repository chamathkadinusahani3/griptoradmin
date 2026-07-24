export interface Bay {
  id: string;
  name: string;
  status: 'Free' | 'Occupied';
  jobCardId?: string;
  vehicle?: string;
  technician?: string;
  branchId?: string;
}

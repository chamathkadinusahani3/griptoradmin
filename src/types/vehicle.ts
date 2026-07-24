export interface Vehicle {
  id: string;
  customerId: string;
  label: string;
  plate?: string;
  make?: string;
  model?: string;
  year?: number;
  notes?: string;
}

export interface Supplier {
  id: string;
  name: string;
  contact?: string;
  email?: string;
  openOrders: number;
  lastOrder?: string;
  onTime?: number;
  totalOutstanding: number;
  totalPaid: number;
}

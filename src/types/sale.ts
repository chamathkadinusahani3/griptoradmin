export interface SaleLine {
  partId: string;
  name: string;
  price: number;
  qty: number;
}

export interface Sale {
  id: string;
  items: SaleLine[];
  subtotal: number;
  tax: number;
  total: number;
  date: string;
  branchId?: string;
}

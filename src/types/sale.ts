export interface SaleLine {
  partId: string;
  name: string;
  price: number;
  qty: number;
  batchNumber?: string;
  serialNumber?: string;
  expiryDate?: string;
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

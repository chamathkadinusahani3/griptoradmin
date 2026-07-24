export interface Part {
  id: string;
  name: string;
  sku?: string;
  barcode?: string;
  category: string;
  stock: number;
  reorderAt: number;
  price: number;
  supplierId?: string;
  supplier?: string;
  branchId?: string;
}

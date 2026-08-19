import { Warehouse, WarehouseDoc } from './models/Warehouse.js';

/** True if warehouseId belongs to this tenant — same ownership-check pattern as branch.ts's isValidBranch. Deliberately doesn't cross-check branchId: a Warehouse's own branchId is optional (see Warehouse.ts), so it isn't always meaningful to compare against the Part/Count's branch. */
export async function isValidWarehouse(clientId: string, warehouseId: string): Promise<boolean> {
  return !!(await Warehouse.exists({ _id: warehouseId, clientId }));
}

export async function getWarehouse(clientId: string, warehouseId: string): Promise<WarehouseDoc | null> {
  return (await Warehouse.findOne({ _id: warehouseId, clientId }).lean()) as WarehouseDoc | null;
}

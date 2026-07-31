export interface Branch {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  isDefault: boolean;
  /** Undefined = falls back to the tenant's Client.capacityPerSlot. */
  capacityPerSlot?: number;
  /** Undefined/empty = full-service (offers every category in the tenant's Service catalog). */
  serviceCategories?: string[];
}

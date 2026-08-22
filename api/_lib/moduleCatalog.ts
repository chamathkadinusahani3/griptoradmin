/**
 * Self-contained copy of `src/data/modules.ts`'s MODULES pricing (id/name/
 * price/addOns only — navGroup/core/tagline aren't needed server-side), for
 * use by api/** code only. Same reasoning as api/_lib/pricingCatalog.ts:
 * importing directly from `src/` works fine under `tsx` but crashes
 * `vercel dev`'s serverless function runtime. Keep this in sync with
 * `src/data/modules.ts`'s MODULES if pricing/catalog ever changes.
 */
export interface ModuleCatalogAddOn {
  id: string;
  name: string;
  price: number;
}

export interface ModuleCatalogEntry {
  id: string;
  name: string;
  price: number;
  addOns: ModuleCatalogAddOn[];
}

export const MODULE_CATALOG: ModuleCatalogEntry[] = [
  {
    id: 'gms',
    name: 'Garage Management System',
    price: 79,
    addOns: [
      { id: 'gms-multi', name: 'Multi-location Support', price: 29 },
      { id: 'gms-fleet', name: 'Fleet Management', price: 39 },
      { id: 'gms-brand', name: 'Custom Branding', price: 19 },
    ],
  },
  {
    id: 'pos',
    name: 'Inventory & POS',
    price: 59,
    addOns: [
      { id: 'pos-warehouse', name: 'Multi-warehouse Sync', price: 25 },
      { id: 'pos-forecast', name: 'Demand Forecasting', price: 35 },
      { id: 'pos-hardware', name: 'Hardware Integration Kit', price: 15 },
    ],
  },
  {
    id: 'crm',
    name: 'Customer CRM',
    price: 49,
    addOns: [
      { id: 'crm-loyalty', name: 'Loyalty & Rewards', price: 20 },
      { id: 'crm-marketing', name: 'Marketing Automation', price: 30 },
      { id: 'crm-app', name: 'Customer Mobile App', price: 25 },
    ],
  },
  { id: 'vehicle-inspection', name: 'Vehicle Inspection', price: 25, addOns: [] },
  { id: 'booking-system', name: 'Booking System', price: 35, addOns: [] },
  { id: 'workshop-management', name: 'Workshop Management', price: 45, addOns: [] },
  { id: 'accounting', name: 'Accounting', price: 49, addOns: [] },
  { id: 'reports-analytics', name: 'Reports & Analytics', price: 39, addOns: [] },
  { id: 'erp', name: 'ERP', price: 69, addOns: [] },
  { id: 'hrm', name: 'HRM', price: 55, addOns: [] },
];

export function findModule(moduleId: string): ModuleCatalogEntry | undefined {
  return MODULE_CATALOG.find((m) => m.id === moduleId);
}

/** Returns the add-on plus which module it belongs to (needed to check that parent module is active before allowing the purchase). */
export function findAddOn(addOnId: string): { addOn: ModuleCatalogAddOn; moduleId: string } | undefined {
  for (const mod of MODULE_CATALOG) {
    const addOn = mod.addOns.find((a) => a.id === addOnId);
    if (addOn) return { addOn, moduleId: mod.id };
  }
  return undefined;
}

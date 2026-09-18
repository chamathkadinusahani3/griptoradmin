import { MODULES } from '../data/modules';

// Maps each permission resource (the part before the ':' in a key like
// "customers:manage") to the module id(s) whose sidebar actually surfaces
// that resource — built by cross-referencing api/_lib/permissions.ts's
// PAIRED_RESOURCES/VIEW_ONLY_RESOURCES/STANDALONE_PERMISSIONS against every
// module's navGroup slugs in src/data/modules.ts. A resource used by more
// than one module's sidebar (e.g. "customers") is listed under all of
// them — an admin browsing either module's section finds the same
// checkbox. A resource with NO module of its own (staff/roles/settings/
// billing/reports/approvals — tenant-wide, not gated to any purchased
// module) is omitted here and falls into the "Core / General" bucket
// instead. This is purely a UI grouping aid — it doesn't change what a
// permission actually grants, and a Role can still hold a permission for a
// module the tenant hasn't purchased (it just has no reachable UI).
const RESOURCE_MODULES: Record<string, string[]> = {
  'job-cards': ['gms'],
  bookings: ['booking-system'],
  bays: ['workshop-management'],
  inspections: ['gms', 'vehicle-inspection'],
  technicians: ['gms', 'vehicle-inspection', 'workshop-management', 'hrm'],
  services: ['booking-system'],
  customers: ['gms', 'crm', 'vehicle-inspection', 'accounting', 'erp'],
  reminders: ['crm'],
  feedback: ['crm'],
  'call-logs': ['crm'],
  'loyalty-rewards': ['crm'],
  'message-templates': ['crm'],
  recruitment: ['hrm'],
  'customer-invoices': ['accounting'],
  quotations: ['accounting'],
  expenses: ['erp'],
  parts: ['pos', 'erp'],
  'purchase-orders': ['pos', 'erp'],
  suppliers: ['pos', 'crm', 'erp'],
  sales: ['pos', 'erp'],
  sms: ['crm'],
  branches: ['gms'],
  payroll: ['erp', 'hrm'],
  'bank-accounts': ['erp'],
  cheques: ['erp'],
  returns: ['pos', 'erp'],
  'credit-notes': ['erp'],
  'debit-notes': ['erp'],
  receipts: ['erp'],
  'advance-payments': ['erp'],
  'stock-issues': ['erp'],
  'cash-handovers': ['erp'],
  utilizations: ['erp'],
  'collection-tasks': ['erp'],
  'price-lists': ['erp'],
  promotions: ['erp'],
  'customer-debit-notes': ['erp'],
  'effective-notes': ['erp'],
  complaints: ['crm', 'erp'],
  departments: ['erp', 'hrm'],
  prospects: ['crm'],
  followups: ['crm'],
  salespersons: ['sales-force'],
  'sf-assignments': ['sales-force'],
  'sf-routes': ['sales-force'],
  'sf-vehicles': ['sales-force'],
  'sf-visits': ['sales-force'],
  'sf-targets': ['sales-force'],
  'sf-collections': ['sales-force'],
  'sf-deliveries': ['sales-force'],
  employees: ['hrm'],
  'performance-reviews': ['hrm'],
  'leave-requests': ['hrm'],
  attendance: ['hrm'],
};

export function titleCase(word: string): string {
  return word.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

export interface ResourceGroup {
  resource: string;
  keys: string[];
}

export interface ModulePermissionGroup {
  id: string;
  name: string;
  resources: ResourceGroup[];
}

/**
 * Groups a flat list of permission keys first by resource, then by which
 * module(s) that resource belongs to — module sections follow MODULES'
 * own display order, with a final "Core / General" section for anything
 * with no module of its own. A resource shared by several modules appears
 * once under each.
 */
export function groupPermissionsByModule(permissions: string[]): ModulePermissionGroup[] {
  const byResource = new Map<string, string[]>();
  for (const p of permissions) {
    const [resource] = p.split(':');
    byResource.set(resource, [...(byResource.get(resource) ?? []), p]);
  }
  const resourceGroups: ResourceGroup[] = [...byResource.entries()].map(([resource, keys]) => ({
    resource,
    keys: [...keys].sort(),
  }));

  const byModule = new Map<string, ResourceGroup[]>();
  const core: ResourceGroup[] = [];
  for (const rg of resourceGroups) {
    const moduleIds = RESOURCE_MODULES[rg.resource];
    if (!moduleIds || moduleIds.length === 0) {
      core.push(rg);
      continue;
    }
    for (const moduleId of moduleIds) {
      byModule.set(moduleId, [...(byModule.get(moduleId) ?? []), rg]);
    }
  }

  const groups: ModulePermissionGroup[] = MODULES.filter((m) => byModule.has(m.id)).map((m) => ({
    id: m.id,
    name: m.name,
    resources: (byModule.get(m.id) ?? []).sort((a, b) => a.resource.localeCompare(b.resource)),
  }));

  if (core.length > 0) {
    groups.push({ id: 'core', name: 'Core / General', resources: core.sort((a, b) => a.resource.localeCompare(b.resource)) });
  }

  return groups;
}

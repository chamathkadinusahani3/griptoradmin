import mongoose from 'mongoose';
import { Role, RoleDoc } from './models/Role.js';
import { User, UserDoc } from './models/User.js';
import { PERMISSIONS, STANDALONE_PERMISSIONS } from './permissions.js';

const MANAGER_ONLY = new Set<string>(STANDALONE_PERMISSIONS);
const NON_MANAGER_PERMISSIONS = PERMISSIONS.filter((p) => !MANAGER_ONLY.has(p));

interface SeedRoleDef {
  name: string;
  department: string;
  isProtectedOwner: boolean;
  permissions: string[];
  branchPinned: boolean;
  requiresCreditLimit: boolean;
}

// A large, name-only catalog (no permissions assigned) covering common
// SaaS/business role titles across every department, so a Super Admin can
// label a tenant user accurately even when their real access is configured
// later via Roles & Permissions. Deliberately NOT wired to any permission —
// unlike the 5 roles above, none of these correspond to an existing
// access-control boundary in the code (see permissions.ts's own header
// comment on why permissions are never invented ahead of a real gate).
// Excludes 'Cashier' and 'Sales Executive', already covered above.
const CATALOG_ROLES: { name: string; department: string }[] = [
  // Super Admin
  { name: 'Platform Administrator', department: 'Super Admin' },
  { name: 'Platform Support', department: 'Super Admin' },
  { name: 'Developer', department: 'Super Admin' },
  { name: 'System Administrator', department: 'Super Admin' },
  { name: 'Database Administrator', department: 'Super Admin' },
  { name: 'Security Administrator', department: 'Super Admin' },
  { name: 'DevOps Engineer', department: 'Super Admin' },
  { name: 'Support Engineer', department: 'Super Admin' },
  // Company Management
  { name: 'Company Owner', department: 'Company Management' },
  { name: 'Tenant Admin', department: 'Company Management' },
  { name: 'CEO', department: 'Company Management' },
  { name: 'Managing Director', department: 'Company Management' },
  { name: 'General Manager', department: 'Company Management' },
  { name: 'Operations Manager', department: 'Company Management' },
  { name: 'Branch Manager', department: 'Company Management' },
  { name: 'Regional Manager', department: 'Company Management' },
  { name: 'Area Manager', department: 'Company Management' },
  { name: 'Department Manager', department: 'Company Management' },
  { name: 'Team Leader', department: 'Company Management' },
  // Sales & CRM
  { name: 'Sales Manager', department: 'Sales & CRM' },
  { name: 'Regional Sales Manager', department: 'Sales & CRM' },
  { name: 'Sales Representative', department: 'Sales & CRM' },
  { name: 'Sales Coordinator', department: 'Sales & CRM' },
  { name: 'Tele Sales Executive', department: 'Sales & CRM' },
  { name: 'Business Development Manager', department: 'Sales & CRM' },
  { name: 'Business Development Executive', department: 'Sales & CRM' },
  { name: 'CRM Manager', department: 'Sales & CRM' },
  { name: 'CRM Executive', department: 'Sales & CRM' },
  { name: 'Customer Relationship Officer', department: 'Sales & CRM' },
  { name: 'Lead Manager', department: 'Sales & CRM' },
  // Customer Service
  { name: 'Customer Service Manager', department: 'Customer Service' },
  { name: 'Customer Service Executive', department: 'Customer Service' },
  { name: 'Customer Support Officer', department: 'Customer Service' },
  { name: 'Receptionist', department: 'Customer Service' },
  { name: 'Call Center Agent', department: 'Customer Service' },
  { name: 'Appointment Coordinator', department: 'Customer Service' },
  // Finance & Accounts
  { name: 'Chief Financial Officer (CFO)', department: 'Finance & Accounts' },
  { name: 'Finance Manager', department: 'Finance & Accounts' },
  { name: 'Accountant', department: 'Finance & Accounts' },
  { name: 'Senior Accountant', department: 'Finance & Accounts' },
  { name: 'Junior Accountant', department: 'Finance & Accounts' },
  { name: 'Accounts Receivable Officer', department: 'Finance & Accounts' },
  { name: 'Accounts Payable Officer', department: 'Finance & Accounts' },
  { name: 'Credit Controller', department: 'Finance & Accounts' },
  { name: 'Payroll Officer', department: 'Finance & Accounts' },
  { name: 'Budget Officer', department: 'Finance & Accounts' },
  { name: 'Internal Auditor', department: 'Finance & Accounts' },
  { name: 'External Auditor', department: 'Finance & Accounts' },
  // Inventory & Warehouse
  { name: 'Inventory Manager', department: 'Inventory & Warehouse' },
  { name: 'Inventory Controller', department: 'Inventory & Warehouse' },
  { name: 'Inventory Auditor', department: 'Inventory & Warehouse' },
  { name: 'Warehouse Manager', department: 'Inventory & Warehouse' },
  { name: 'Warehouse Supervisor', department: 'Inventory & Warehouse' },
  { name: 'Warehouse Assistant', department: 'Inventory & Warehouse' },
  { name: 'Store Manager', department: 'Inventory & Warehouse' },
  { name: 'Store Keeper', department: 'Inventory & Warehouse' },
  { name: 'Stock Controller', department: 'Inventory & Warehouse' },
  { name: 'Stock Auditor', department: 'Inventory & Warehouse' },
  // Purchasing & Procurement
  { name: 'Procurement Manager', department: 'Purchasing & Procurement' },
  { name: 'Procurement Officer', department: 'Purchasing & Procurement' },
  { name: 'Procurement Executive', department: 'Purchasing & Procurement' },
  { name: 'Purchasing Manager', department: 'Purchasing & Procurement' },
  { name: 'Purchasing Officer', department: 'Purchasing & Procurement' },
  { name: 'Purchase Assistant', department: 'Purchasing & Procurement' },
  { name: 'Supplier Coordinator', department: 'Purchasing & Procurement' },
  // Workshop / Garage
  { name: 'Workshop Manager', department: 'Workshop / Garage' },
  { name: 'Workshop Supervisor', department: 'Workshop / Garage' },
  { name: 'Workshop Controller', department: 'Workshop / Garage' },
  { name: 'Service Manager', department: 'Workshop / Garage' },
  { name: 'Service Advisor', department: 'Workshop / Garage' },
  { name: 'Service Technician', department: 'Workshop / Garage' },
  { name: 'Mechanic', department: 'Workshop / Garage' },
  { name: 'Senior Mechanic', department: 'Workshop / Garage' },
  { name: 'Junior Mechanic', department: 'Workshop / Garage' },
  { name: 'Auto Electrician', department: 'Workshop / Garage' },
  { name: 'Tyre Technician', department: 'Workshop / Garage' },
  { name: 'Wheel Alignment Technician', department: 'Workshop / Garage' },
  { name: 'Wheel Balancing Technician', department: 'Workshop / Garage' },
  { name: 'Vehicle Inspector', department: 'Workshop / Garage' },
  { name: 'Quality Inspector', department: 'Workshop / Garage' },
  { name: 'Quality Controller', department: 'Workshop / Garage' },
  { name: 'Warranty Officer', department: 'Workshop / Garage' },
  { name: 'Insurance Coordinator', department: 'Workshop / Garage' },
  { name: 'Claims Officer', department: 'Workshop / Garage' },
  // Logistics & Fleet
  { name: 'Fleet Manager', department: 'Logistics & Fleet' },
  { name: 'Fleet Supervisor', department: 'Logistics & Fleet' },
  { name: 'Transport Manager', department: 'Logistics & Fleet' },
  { name: 'Logistics Manager', department: 'Logistics & Fleet' },
  { name: 'Logistics Coordinator', department: 'Logistics & Fleet' },
  { name: 'Dispatch Officer', department: 'Logistics & Fleet' },
  { name: 'Delivery Coordinator', department: 'Logistics & Fleet' },
  { name: 'Driver', department: 'Logistics & Fleet' },
  { name: 'Delivery Driver', department: 'Logistics & Fleet' },
  // Human Resources
  { name: 'HR Manager', department: 'Human Resources' },
  { name: 'HR Executive', department: 'Human Resources' },
  { name: 'HR Officer', department: 'Human Resources' },
  { name: 'Recruiter', department: 'Human Resources' },
  { name: 'Training Manager', department: 'Human Resources' },
  { name: 'Training Coordinator', department: 'Human Resources' },
  { name: 'Attendance Officer', department: 'Human Resources' },
  // Marketing
  { name: 'Marketing Manager', department: 'Marketing' },
  { name: 'Marketing Executive', department: 'Marketing' },
  { name: 'Digital Marketing Manager', department: 'Marketing' },
  { name: 'Digital Marketing Executive', department: 'Marketing' },
  { name: 'Social Media Manager', department: 'Marketing' },
  { name: 'Social Media Executive', department: 'Marketing' },
  { name: 'Content Creator', department: 'Marketing' },
  { name: 'Graphic Designer', department: 'Marketing' },
  { name: 'SEO Specialist', department: 'Marketing' },
  // Manufacturing
  { name: 'Production Manager', department: 'Manufacturing' },
  { name: 'Production Supervisor', department: 'Manufacturing' },
  { name: 'Production Operator', department: 'Manufacturing' },
  { name: 'Factory Manager', department: 'Manufacturing' },
  { name: 'Manufacturing Supervisor', department: 'Manufacturing' },
  { name: 'Quality Assurance Officer', department: 'Manufacturing' },
  // Import / Export
  { name: 'Import Manager', department: 'Import / Export' },
  { name: 'Import Executive', department: 'Import / Export' },
  { name: 'Export Manager', department: 'Import / Export' },
  { name: 'Export Executive', department: 'Import / Export' },
  { name: 'Customs Coordinator', department: 'Import / Export' },
  // Compliance & Legal
  { name: 'Compliance Manager', department: 'Compliance & Legal' },
  { name: 'Compliance Officer', department: 'Compliance & Legal' },
  { name: 'Legal Officer', department: 'Compliance & Legal' },
  { name: 'Legal Advisor', department: 'Compliance & Legal' },
  { name: 'Safety Officer', department: 'Compliance & Legal' },
  { name: 'Risk Manager', department: 'Compliance & Legal' },
  // Analytics & Reporting
  { name: 'Business Analyst', department: 'Analytics & Reporting' },
  { name: 'Data Analyst', department: 'Analytics & Reporting' },
  { name: 'BI Analyst', department: 'Analytics & Reporting' },
  { name: 'Reporting Officer', department: 'Analytics & Reporting' },
  // Dealer & Customer Portal
  { name: 'Dealer Owner', department: 'Dealer & Customer Portal' },
  { name: 'Dealer Manager', department: 'Dealer & Customer Portal' },
  { name: 'Dealer Employee', department: 'Dealer & Customer Portal' },
  { name: 'Customer', department: 'Dealer & Customer Portal' },
  { name: 'Corporate Customer', department: 'Dealer & Customer Portal' },
  { name: 'Supplier', department: 'Dealer & Customer Portal' },
  { name: 'Supplier Portal User', department: 'Dealer & Customer Portal' },
  { name: 'Vendor', department: 'Dealer & Customer Portal' },
  { name: 'Vendor Manager', department: 'Dealer & Customer Portal' },
  { name: 'Franchise Owner', department: 'Dealer & Customer Portal' },
  { name: 'Franchise Manager', department: 'Dealer & Customer Portal' },
  // IT & Technical
  { name: 'IT Manager', department: 'IT & Technical' },
  { name: 'IT Administrator', department: 'IT & Technical' },
  { name: 'Help Desk Officer', department: 'IT & Technical' },
  { name: 'Network Administrator', department: 'IT & Technical' },
  { name: 'API Administrator', department: 'IT & Technical' },
  // AI & Automation
  { name: 'AI Assistant', department: 'AI & Automation' },
  { name: 'AI Administrator', department: 'AI & Automation' },
  { name: 'Automation Manager', department: 'AI & Automation' },
];

// Reproduces today's real, live behavior exactly (verified against the
// requireTenant/requireTenantManager inventory, not guessed): Manager
// currently passes both requireTenant and requireTenantManager everywhere,
// so it gets every permission. Technician/Cashier/Sales Executive currently
// have identical full requireTenant-level access to each other (zero
// existing differentiation) but none of the manager-only actions — and
// Technician/Cashier are the two roles resolveBranchFilter force-pins today,
// Sales Executive is the one salesExecCredit.ts enforces a personal limit
// on. A tenant can freely edit/rename/reconfigure all 4 non-Owner roles
// after this ships (Phase 4) — this is only the zero-regression starting
// point, not a fixed policy.
//
// NOTE on evolving this list: ensureRolesSeeded's `existing.length >=
// SEED_ROLES.length` guard means growing this array DOES backfill brand-new
// entries into already-seeded tenants (the next time anything calls
// ensureRolesSeeded for them — lazy, not eager/immediate) since their
// existing count then falls below the new total and insertMany runs again;
// the unique {clientId,name} index just skips names that already exist. What
// does NOT retroactively apply is EDITING an existing entry's fields
// (permissions/branchPinned/etc) — that only affects tenants seeded after
// the edit, never a document already inserted.
export const SEED_ROLES: SeedRoleDef[] = [
  { name: 'Owner', department: 'Company Management', isProtectedOwner: true, permissions: [], branchPinned: false, requiresCreditLimit: false },
  { name: 'Manager', department: 'Company Management', isProtectedOwner: false, permissions: [...PERMISSIONS], branchPinned: false, requiresCreditLimit: false },
  { name: 'Technician', department: 'Workshop / Garage', isProtectedOwner: false, permissions: [...NON_MANAGER_PERMISSIONS], branchPinned: true, requiresCreditLimit: false },
  { name: 'Cashier', department: 'Finance & Accounts', isProtectedOwner: false, permissions: [...NON_MANAGER_PERMISSIONS], branchPinned: true, requiresCreditLimit: false },
  { name: 'Sales Executive', department: 'Sales & CRM', isProtectedOwner: false, permissions: [...NON_MANAGER_PERMISSIONS], branchPinned: false, requiresCreditLimit: true },
  // Name-only catalog (no permissions) — see CATALOG_ROLES' own comment above.
  ...CATALOG_ROLES.map((r) => ({ ...r, isProtectedOwner: false, permissions: [] as string[], branchPinned: false, requiresCreditLimit: false })),
];

// Fallback for serializeRole — roles seeded before the `department` column
// existed won't have it stored in Mongo (schema defaults don't apply
// retroactively), so look it up by name instead of leaving it blank.
export const DEPARTMENT_BY_ROLE_NAME: Record<string, string> = Object.fromEntries(
  SEED_ROLES.map((r) => [r.name, r.department])
);

/**
 * Idempotent per-tenant seed of every SEED_ROLES entry. Safe under concurrent
 * calls (two staff of a never-before-seeded tenant logging in at once):
 * relies on Role's unique {clientId,name} index — attempts insertMany, and
 * if a duplicate-key error hits (another concurrent call already inserted
 * some/all of them), swallows it and falls through to the unconditional
 * re-find below, so every caller ends up with the same real documents
 * regardless of who "won" the race.
 */
export async function ensureRolesSeeded(clientId: string | mongoose.Types.ObjectId): Promise<RoleDoc[]> {
  const existing = (await Role.find({ clientId }).lean()) as RoleDoc[];
  if (existing.length >= SEED_ROLES.length) return existing;

  try {
    await Role.insertMany(
      SEED_ROLES.map((r) => ({ clientId, ...r })),
      { ordered: false }
    );
  } catch (err) {
    // 11000 = duplicate key on the {clientId,name} unique index — another
    // concurrent request already seeded some/all of these. Not a real
    // failure, just the expected race outcome; fall through to re-find.
    const isDuplicateKey = typeof err === 'object' && err !== null && 'code' in err && (err as { code?: number }).code === 11000;
    if (!isDuplicateKey) throw err;
  }

  return (await Role.find({ clientId }).lean()) as RoleDoc[];
}

/**
 * Resolves (and persists) a User's roleId the first time it's needed —
 * mirrors requireTenant's existing `tenantRole ?? 'Owner'` default exactly,
 * and deliberately applies that default BEFORE the name-match, not after:
 * matching `undefined` against a seed name first would leave a real
 * pre-existing single-login garage owner with roleId: null -> zero
 * permissions -> locked out of their own account.
 */
export async function resolveUserRole(user: UserDoc, roles: RoleDoc[]): Promise<RoleDoc> {
  if (user.roleId) {
    const existing = roles.find((r) => r._id.toString() === user.roleId!.toString());
    if (existing) return existing;
  }

  const legacyName = user.tenantRole ?? 'Owner';
  const matched = roles.find((r) => r.name === legacyName) ?? roles.find((r) => r.isProtectedOwner);
  if (!matched) {
    throw new Error(`No seeded role matched "${legacyName}" and no protected-Owner role exists for client ${user.clientId}`);
  }

  await User.updateOne({ _id: user._id }, { roleId: matched._id });
  return matched;
}

/** Convenience wrapper for login.ts: seed-if-needed, then resolve. */
export async function getOrResolveUserRole(user: UserDoc): Promise<RoleDoc> {
  const roles = await ensureRolesSeeded(user.clientId!);
  return resolveUserRole(user, roles);
}

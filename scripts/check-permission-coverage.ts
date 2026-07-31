// Static-only check (no DB, no network) — safe to run any time. Verifies:
// 1. Every permission string literal actually used across api/_lib/routes/**
//    (via requireTenantPermission/hasPermission calls) is a real key in the
//    PERMISSIONS taxonomy — catches a typo that would otherwise silently
//    make that check unpassable by anyone except the Owner (a seeded role's
//    permissions array can never contain a string that isn't in PERMISSIONS).
// 2. The union of the 4 non-Owner seeded roles' permissions covers the
//    entire PERMISSIONS taxonomy — catches a gap where a real endpoint's
//    permission requirement was never granted to any non-Owner role at all
//    (the exact class of bug the payroll-runs omission was).
import { execSync } from 'child_process';
import { PERMISSIONS } from '../api/_lib/permissions.js';
import { SEED_ROLES } from '../api/_lib/roleSeed.js';

let failures = 0;
function assert(cond: boolean, label: string) {
  if (cond) console.log(`  PASS: ${label}`);
  else {
    console.log(`  FAIL: ${label}`);
    failures++;
  }
}

function extractUsedPermissions(): string[] {
  const grepA = execSync(`grep -rhoE "requireTenantPermission\\([^,]+, [^,]+, '[^']+'\\)" api/_lib/routes/`, { encoding: 'utf8' });
  const grepB = execSync(`grep -rhoE "hasPermission\\([^,]+, '[^']+'\\)" api/_lib/`, { encoding: 'utf8' });
  const combined = grepA + '\n' + grepB;
  const matches = [...combined.matchAll(/'([a-z-]+:[a-z-]+)'/g)];
  return [...new Set(matches.map((m) => m[1]))];
}

console.log('--- Every permission string literal used in code is a real taxonomy key ---');
const used = extractUsedPermissions();
console.log(`Found ${used.length} distinct permission strings in use.`);
const permSet = new Set(PERMISSIONS);
for (const p of used) {
  assert(permSet.has(p), `"${p}" is a valid taxonomy permission`);
}

console.log('\n--- The 4 non-Owner seeded roles jointly cover every taxonomy permission ---');
const nonOwnerRoles = SEED_ROLES.filter((r) => !r.isProtectedOwner);
assert(nonOwnerRoles.length === 4, `exactly 4 non-Owner seeded roles exist (got ${nonOwnerRoles.length})`);
const union = new Set(nonOwnerRoles.flatMap((r) => r.permissions));
const missingFromUnion = PERMISSIONS.filter((p) => !union.has(p));
assert(missingFromUnion.length === 0, `every taxonomy permission is granted to at least one non-Owner role (missing: ${missingFromUnion.join(', ') || 'none'})`);

console.log('\n--- Manager specifically has every permission (today\'s real Owner==Manager access parity) ---');
const managerRole = SEED_ROLES.find((r) => r.name === 'Manager')!;
const managerMissing = PERMISSIONS.filter((p) => !managerRole.permissions.includes(p));
assert(managerMissing.length === 0, `Manager has all ${PERMISSIONS.length} permissions (missing: ${managerMissing.join(', ') || 'none'})`);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);

import { Branch } from './models/Branch';
import { TenantRole } from './auth';

/** True if branchId belongs to this tenant — same ownership check pattern reused across every branch-scoped create endpoint. */
export async function isValidBranch(clientId: string, branchId: string): Promise<boolean> {
  return !!(await Branch.exists({ _id: branchId, clientId }));
}

/**
 * Resolves the branchId a branch-aware list endpoint should actually filter
 * by, given the logged-in staff member's own pin and whatever they asked
 * for in the query string.
 *
 * A Technician/Cashier pinned to one branch is FORCE-scoped to it — their
 * own `?branchId=` query param is ignored, not trusted, if it names a
 * different branch. This is the real enforcement the Phase 9 plan flagged
 * as not yet possible (no second actor existed to enforce it against) and
 * the exact class of bug confirmed in Anura's `quotations.js`/`invoices.js`:
 * declaring branch-awareness in an endpoint without actually checking who's
 * asking, so a branch-restricted user could see every branch just by
 * omitting the filter.
 *
 * Owner/Manager and any unpinned staff member are unrestricted — they get
 * whichever branch they ask for, or none (all branches), same as before
 * this feature existed.
 */
export function resolveBranchFilter(
  session: { tenantRole: TenantRole; branchId?: string },
  requestedBranchId: string | undefined
): string | undefined {
  const isPinnable = session.tenantRole === 'Technician' || session.tenantRole === 'Cashier';
  if (isPinnable && session.branchId) return session.branchId;
  return requestedBranchId;
}

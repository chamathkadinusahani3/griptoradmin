import type { VercelRequest, VercelResponse } from '@vercel/node';
import jwt from 'jsonwebtoken';
import { parseCookie, stringifySetCookie } from 'cookie';
import { connectToDatabase } from './db.js';
import { Role } from './models/Role.js';
import { User } from './models/User.js';

const COOKIE_NAME = 'griptor_session';
// Separate cookie (and JWT payload shape) for customer-portal sessions —
// deliberately never sharing a name with the staff cookie above, so a staff
// member's session and a customer's session coexist independently in the
// same browser (same origin, same `/`-scoped path) instead of one silently
// clobbering the other.
const CUSTOMER_COOKIE_NAME = 'griptor_customer_session';
// Holds a Super Admin's ORIGINAL raw session token, verbatim, while they're
// impersonating a tenant — griptor_session itself gets overwritten with the
// impersonated tenant's token (same cookie name is shared by super/tenant
// sessions today), so this is the only way to restore the real admin
// session on exit without forcing a full re-login.
const IMPERSONATOR_COOKIE_NAME = 'griptor_impersonator_session';
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days
// Deliberately much shorter than a normal session — limits how long a
// forgotten-to-exit impersonation session stays valid.
const IMPERSONATION_MAX_AGE_SECONDS = 4 * 60 * 60; // 4 hours

export type TenantRole = 'Owner' | 'Manager' | 'Technician' | 'Cashier' | 'Sales Executive';

export interface SessionPayload {
  sub: string; // user id
  role: 'super' | 'tenant';
  /** Only present for role: 'tenant' — which Client (garage) this session belongs to. */
  clientId?: string;
  /** Only present for role: 'tenant' — this staff member's sub-role. Absent on tokens issued before this field existed; requireTenant() below defaults it to 'Owner'.
   * DEPRECATED as of the Role/permission system (api/_lib/models/Role.ts, roleId below) — left in place, unwritten-to, as a frozen historical remnant. Do not add new reads of this field. */
  tenantRole?: TenantRole;
  /** Only present for role: 'tenant' — optional pin to one Branch. */
  branchId?: string;
  /** Only present for role: 'tenant' — the staff member's custom Role (api/_lib/models/Role.ts). Resolved once at login (api/_lib/roleSeed.ts's getOrResolveUserRole); a later permission edit only takes effect on next login, same staleness already accepted for clientId/Client.status. */
  roleId?: string;
  /** True only for the tenant's single protected Owner role — short-circuits every permission check (never a materialized permission list), so new permissions automatically cover the Owner with no migration. */
  isOwner?: boolean;
  /** Mirrors Role.branchPinned — replaces the old tenantRole==='Technician'||'Cashier' string check in api/_lib/branch.ts. */
  branchPinned?: boolean;
  /** Mirrors Role.requiresCreditLimit — replaces the old tenantRole==='Sales Executive' check in api/_lib/salesExecCredit.ts. The actual limit value stays on User.creditLimit. */
  requiresCreditLimit?: boolean;
  /** Only present on a tenant session created by clients/[id]/impersonate.ts — the super admin User id who started this impersonation. Every route that already scopes by session.sub/clientId works unchanged; this is purely for the UI banner + exit-impersonation flow. */
  impersonatedBy?: string;
}

/** A garage customer's own portal session — a separate identity space from staff SessionPayload above. */
export interface CustomerSessionPayload {
  customerId: string;
  clientId: string;
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not set. Add it to griptoradmin/.env.local');
  }
  return secret;
}

function buildCookieHeader(name: string, value: string, maxAge: number): string {
  return stringifySetCookie({
    name,
    value,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge,
  });
}

export function signSession(payload: SessionPayload, expiresInSeconds: number = MAX_AGE_SECONDS): string {
  return jwt.sign(payload, getSecret(), { expiresIn: expiresInSeconds });
}

export function verifySession(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, getSecret()) as SessionPayload;
  } catch {
    return null;
  }
}

export function setSessionCookie(res: VercelResponse, token: string, maxAgeSeconds: number = MAX_AGE_SECONDS): void {
  res.setHeader('Set-Cookie', buildCookieHeader(COOKIE_NAME, token, maxAgeSeconds));
}

export function clearSessionCookie(res: VercelResponse): void {
  res.setHeader('Set-Cookie', buildCookieHeader(COOKIE_NAME, '', 0));
}

/** The raw (still-encoded) session cookie value, verbatim — used only to stash a Super Admin's real token while impersonating, so it can be restored byte-for-byte on exit rather than re-derived. */
export function getRawSessionCookie(req: VercelRequest): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  const parsed = parseCookie(raw);
  return parsed[COOKIE_NAME] ?? null;
}

/**
 * Sets BOTH the impersonated-tenant session cookie AND the stashed-original
 * Super Admin session cookie in one response. Deliberately a single call
 * setting `Set-Cookie` once with an array — Node's `res.setHeader` REPLACES
 * (doesn't append) a header set with a plain string, so two separate
 * `setHeader('Set-Cookie', ...)` calls in the same response would silently
 * drop the first cookie. This is the only safe way to set two cookies here.
 */
export function setImpersonationCookies(res: VercelResponse, tenantToken: string, rawSuperToken: string): void {
  res.setHeader('Set-Cookie', [
    buildCookieHeader(COOKIE_NAME, tenantToken, IMPERSONATION_MAX_AGE_SECONDS),
    buildCookieHeader(IMPERSONATOR_COOKIE_NAME, rawSuperToken, IMPERSONATION_MAX_AGE_SECONDS),
  ]);
}

/** Exiting impersonation: restore the real session cookie AND clear the impersonator cookie in one response, same "array, not two calls" reasoning as setImpersonationCookies. */
export function restoreFromImpersonation(res: VercelResponse, rawSuperToken: string): void {
  res.setHeader('Set-Cookie', [
    buildCookieHeader(COOKIE_NAME, rawSuperToken, MAX_AGE_SECONDS),
    buildCookieHeader(IMPERSONATOR_COOKIE_NAME, '', 0),
  ]);
}

export function getImpersonatorSessionFromRequest(req: VercelRequest): SessionPayload | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  const parsed = parseCookie(raw);
  const token = parsed[IMPERSONATOR_COOKIE_NAME];
  if (!token) return null;
  return verifySession(token);
}

export function getRawImpersonatorCookie(req: VercelRequest): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  const parsed = parseCookie(raw);
  return parsed[IMPERSONATOR_COOKIE_NAME] ?? null;
}

export function clearImpersonatorCookie(res: VercelResponse): void {
  res.setHeader('Set-Cookie', buildCookieHeader(IMPERSONATOR_COOKIE_NAME, '', 0));
}

export function getSessionFromRequest(req: VercelRequest): SessionPayload | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  const parsed = parseCookie(raw);
  const token = parsed[COOKIE_NAME];
  if (!token) return null;
  return verifySession(token);
}

export function signCustomerSession(payload: CustomerSessionPayload): string {
  return jwt.sign(payload, getSecret(), { expiresIn: MAX_AGE_SECONDS });
}

export function verifyCustomerSession(token: string): CustomerSessionPayload | null {
  try {
    return jwt.verify(token, getSecret()) as CustomerSessionPayload;
  } catch {
    return null;
  }
}

export function setCustomerSessionCookie(res: VercelResponse, token: string): void {
  res.setHeader('Set-Cookie', buildCookieHeader(CUSTOMER_COOKIE_NAME, token, MAX_AGE_SECONDS));
}

export function clearCustomerSessionCookie(res: VercelResponse): void {
  res.setHeader('Set-Cookie', buildCookieHeader(CUSTOMER_COOKIE_NAME, '', 0));
}

export function getCustomerSessionFromRequest(req: VercelRequest): CustomerSessionPayload | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  const parsed = parseCookie(raw);
  const token = parsed[CUSTOMER_COOKIE_NAME];
  if (!token) return null;
  return verifyCustomerSession(token);
}

/**
 * Reads and validates the customer-portal session cookie for a protected
 * endpoint — the customer-portal equivalent of requireTenant below. Every
 * portal data endpoint must still filter its query by BOTH clientId and
 * customerId from this — never customerId alone — since griptoradmin's
 * multi-tenancy boundary and the finer per-customer boundary are two
 * separate checks.
 */
export function requireCustomer(
  req: VercelRequest,
  res: VercelResponse
): { customerId: string; clientId: string } | null {
  const session = getCustomerSessionFromRequest(req);
  if (!session) {
    res.status(401).json({ error: 'Not authenticated' });
    return null;
  }
  return { customerId: session.customerId, clientId: session.clientId };
}

/**
 * Reads and validates the session cookie for a protected endpoint.
 * Writes a 401 response and returns null if there's no valid session,
 * or the session role doesn't match `requiredRole` (when provided).
 */
export function requireAuth(
  req: VercelRequest,
  res: VercelResponse,
  requiredRole?: 'super' | 'tenant'
): SessionPayload | null {
  const session = getSessionFromRequest(req);
  if (!session) {
    res.status(401).json({ error: 'Not authenticated' });
    return null;
  }
  if (requiredRole && session.role !== requiredRole) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return session;
}

/**
 * Like requireAuth(req, res, 'tenant'), but also guarantees clientId is
 * present — every tenant-scoped endpoint's multi-tenancy boundary depends
 * on it, so a tenant session without one (a data-integrity problem) is
 * treated as a hard failure rather than silently scoping to "everything."
 *
 * `tenantRole` defaults to 'Owner' when absent from the JWT — covers both
 * tokens issued before this field existed and (via login.ts's own default)
 * every pre-existing single-login garage, so every real existing account
 * keeps full access with zero migration needed.
 */
export interface TenantSession {
  sub: string;
  clientId: string;
  /** @deprecated superseded by roleId/isOwner/permissions — kept only so not-yet-migrated call sites keep compiling during the phased rollout. */
  tenantRole: TenantRole;
  branchId?: string;
  roleId?: string;
  isOwner: boolean;
  branchPinned: boolean;
  requiresCreditLimit: boolean;
  impersonatedBy?: string;
}

export function requireTenant(req: VercelRequest, res: VercelResponse): TenantSession | null {
  const session = requireAuth(req, res, 'tenant');
  if (!session) return null;
  if (!session.clientId) {
    res.status(403).json({ error: 'This account is not linked to a garage' });
    return null;
  }
  return {
    sub: session.sub,
    clientId: session.clientId,
    tenantRole: session.tenantRole ?? 'Owner',
    branchId: session.branchId,
    roleId: session.roleId,
    isOwner: session.isOwner ?? false,
    branchPinned: session.branchPinned ?? false,
    requiresCreditLimit: session.requiresCreditLimit ?? false,
    impersonatedBy: session.impersonatedBy,
  };
}

/** Like requireTenant, but also requires the staff member's own tenantRole to be Owner or Manager — the real enforcement point for staff management and Approval responses.
 * @deprecated Phase 1 of the Role/permission rollout replaces every call site with requireTenantPermission(req, res, '<key>') — kept only until that phase lands. */
export function requireTenantManager(req: VercelRequest, res: VercelResponse): TenantSession | null {
  const session = requireTenant(req, res);
  if (!session) return null;
  if (session.tenantRole !== 'Owner' && session.tenantRole !== 'Manager') {
    res.status(403).json({ error: 'Only an Owner or Manager can do this' });
    return null;
  }
  return session;
}

/**
 * Like requireTenant, but also requires the caller's Role to include the
 * given permission (api/_lib/permissions.ts) — the real enforcement point
 * for every endpoint in the app going forward, replacing requireTenantManager
 * above one call site at a time. The Owner always passes unconditionally
 * (isOwner short-circuits, never a materialized permission list — see
 * Role.ts's own comment on isProtectedOwner) so every future permission
 * automatically covers the Owner with no migration.
 *
 * Does one Role.findById per call — a real per-request DB lookup, matching
 * the trade-off entitlements.ts's hasAddOn() already accepts for a related
 * authorization concern: permission *revocation* needs to take effect
 * faster than a stale JWT would allow (embedding the full permission list
 * in the JWT would mean up to 7 days before a revoked permission stopped
 * working). connectToDatabase() is idempotent/cached, safe to call here
 * even if the route also calls it again afterward.
 */
/** The plain boolean check behind requireTenantPermission — for the rare call site that needs to branch on permission rather than hard-fail on it (e.g. leave-requests/[id].ts's PATCH, where only one of two possible actions requires this permission and the other has its own separate rule). */
export async function hasPermission(session: { isOwner: boolean; roleId?: string; sub: string }, permission: string): Promise<boolean> {
  if (session.isOwner) return true;
  await connectToDatabase();
  // A per-user override (api/_lib/models/User.ts) fully replaces the role's
  // permission list when present — checked before the Role lookup so a
  // customized user never falls through to their role's defaults.
  const user = await User.findById(session.sub).select('permissionOverrides').lean();
  if (user?.permissionOverrides) return user.permissionOverrides.includes(permission);
  if (!session.roleId) return false;
  const role = await Role.findById(session.roleId).select('permissions').lean();
  return !!role && role.permissions.includes(permission);
}

export async function requireTenantPermission(
  req: VercelRequest,
  res: VercelResponse,
  permission: string
): Promise<TenantSession | null> {
  const session = requireTenant(req, res);
  if (!session) return null;
  if (await hasPermission(session, permission)) return session;
  res.status(403).json({ error: `You don't have permission to do this (requires "${permission}").` });
  return null;
}

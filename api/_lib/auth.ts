import type { VercelRequest, VercelResponse } from '@vercel/node';
import jwt from 'jsonwebtoken';
import { parseCookie, stringifySetCookie } from 'cookie';

const COOKIE_NAME = 'griptor_session';
// Separate cookie (and JWT payload shape) for customer-portal sessions —
// deliberately never sharing a name with the staff cookie above, so a staff
// member's session and a customer's session coexist independently in the
// same browser (same origin, same `/`-scoped path) instead of one silently
// clobbering the other.
const CUSTOMER_COOKIE_NAME = 'griptor_customer_session';
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days

export type TenantRole = 'Owner' | 'Manager' | 'Technician' | 'Cashier';

export interface SessionPayload {
  sub: string; // user id
  role: 'super' | 'tenant';
  /** Only present for role: 'tenant' — which Client (garage) this session belongs to. */
  clientId?: string;
  /** Only present for role: 'tenant' — this staff member's sub-role. Absent on tokens issued before this field existed; requireTenant() below defaults it to 'Owner'. */
  tenantRole?: TenantRole;
  /** Only present for role: 'tenant' — optional pin to one Branch. */
  branchId?: string;
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

export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, getSecret(), { expiresIn: MAX_AGE_SECONDS });
}

export function verifySession(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, getSecret()) as SessionPayload;
  } catch {
    return null;
  }
}

export function setSessionCookie(res: VercelResponse, token: string): void {
  res.setHeader('Set-Cookie', buildCookieHeader(COOKIE_NAME, token, MAX_AGE_SECONDS));
}

export function clearSessionCookie(res: VercelResponse): void {
  res.setHeader('Set-Cookie', buildCookieHeader(COOKIE_NAME, '', 0));
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
export function requireTenant(
  req: VercelRequest,
  res: VercelResponse
): { sub: string; clientId: string; tenantRole: TenantRole; branchId?: string } | null {
  const session = requireAuth(req, res, 'tenant');
  if (!session) return null;
  if (!session.clientId) {
    res.status(403).json({ error: 'This account is not linked to a garage' });
    return null;
  }
  return { sub: session.sub, clientId: session.clientId, tenantRole: session.tenantRole ?? 'Owner', branchId: session.branchId };
}

/** Like requireTenant, but also requires the staff member's own tenantRole to be Owner or Manager — the real enforcement point for staff management and Approval responses. */
export function requireTenantManager(
  req: VercelRequest,
  res: VercelResponse
): { sub: string; clientId: string; tenantRole: TenantRole; branchId?: string } | null {
  const session = requireTenant(req, res);
  if (!session) return null;
  if (session.tenantRole !== 'Owner' && session.tenantRole !== 'Manager') {
    res.status(403).json({ error: 'Only an Owner or Manager can do this' });
    return null;
  }
  return session;
}

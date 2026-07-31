import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Applies CORS headers for the one public, cross-origin endpoint
 * (tenant self-registration from griptorweb). Every other endpoint is
 * same-origin (griptoradmin calling its own API) and doesn't need this.
 *
 * Returns true if the request was a preflight OPTIONS request that this
 * function already responded to — the caller should return immediately.
 */
export function applyPublicCors(req: VercelRequest, res: VercelResponse): boolean {
  const allowedOrigin = process.env.PUBLIC_SITE_ORIGIN;
  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

/**
 * Like applyPublicCors, but also allows the browser to send/receive cookies
 * on the cross-origin request (Access-Control-Allow-Credentials) — needed
 * only by api/auth/login.ts, which sets a real session cookie. Kept as a
 * separate function rather than a flag on applyPublicCors so the two call
 * sites stay obviously distinguishable: this one hands out an authenticated
 * session, the other two (register, leads/submit) never touch cookies.
 * Access-Control-Allow-Origin must be one specific origin (never '*') for
 * credentialed CORS to work at all — already true here via PUBLIC_SITE_ORIGIN.
 */
export function applyPublicCorsWithCredentials(req: VercelRequest, res: VercelResponse): boolean {
  const allowedOrigin = process.env.PUBLIC_SITE_ORIGIN;
  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

/**
 * Like applyPublicCors, but for a public GET endpoint (griptorweb's Pricing
 * section reading real plan data — api/public/pricing-tiers.ts) instead of
 * POST — a separate function rather than a parameterized method list, same
 * "keep call sites obviously distinguishable" reasoning as
 * applyPublicCorsWithCredentials above.
 */
export function applyPublicCorsGet(req: VercelRequest, res: VercelResponse): boolean {
  const allowedOrigin = process.env.PUBLIC_SITE_ORIGIN;
  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

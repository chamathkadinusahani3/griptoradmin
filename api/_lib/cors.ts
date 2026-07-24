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

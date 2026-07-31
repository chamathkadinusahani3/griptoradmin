import type { VercelRequest } from '@vercel/node';

/**
 * Derives the app's own origin server-side, for building absolute
 * return/cancel/notify URLs for a payment gateway redirect. Deliberately
 * not trusting a client-supplied full URL here (which the gateway would
 * then redirect to) — origin/referer are set by the browser itself, not
 * attacker-controllable the way a request body field would be. Falls back
 * to local dev's default Vite port.
 */
export function resolveAppOrigin(req: VercelRequest): string {
  const origin = req.headers.origin;
  if (typeof origin === 'string' && origin) return origin;
  const referer = req.headers.referer;
  if (typeof referer === 'string' && referer) {
    try {
      return new URL(referer).origin;
    } catch {
      // fall through to default below
    }
  }
  return 'http://localhost:5173';
}

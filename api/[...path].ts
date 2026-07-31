import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ROUTES } from './_lib/routes/table.js';

// The single serverless function backing every /api/* route (Vercel's free
// Hobby plan caps a deployment at 12 functions; this project had grown to
// 102 separate route files, one per endpoint, well past that cap — every
// production deploy was failing as a result). All the original handler
// files were moved unchanged under api/_lib/routes/ (excluded from Vercel's
// routing since any `_`-prefixed folder is never turned into a function)
// and are dispatched to from here based on the auto-generated table in
// api/_lib/routes/table.ts (see __generate-route-table.ts at the repo root —
// re-run it after adding/removing/renaming a route file).
//
// Matching mirrors what Vercel's own file-based router already did:
// segment count must match exactly, every literal segment in a route must
// match the request verbatim, and among all structurally-matching routes the
// MOST SPECIFIC one wins (the one with the fewest dynamic segments) — this
// is what correctly resolves e.g. /api/customers/corporate-summary to its
// own literal route instead of being swallowed by /api/customers/[id] with
// id="corporate-summary". Dynamic segments are written back onto
// req.query.<name>, exactly replicating Vercel's own file-router behavior,
// so every existing handler's req.query.id/req.query.tierId/etc. usage
// needed zero changes.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const pathParam = req.query.path;
  // vercel.json's explicit rewrite (added because this project's build
  // auto-generated an incorrect single-segment-only regex for a bare
  // [...path] filename — confirmed directly via `vercel build`'s own
  // .vercel/output/config.json before this was added) passes the whole
  // matched path as ONE slash-joined string (e.g. "tenant/me"), not the
  // segment array Vercel's native catch-all convention would populate — so
  // this must split it, on top of still accepting a real array in case that
  // native behavior ever applies again.
  const segments = Array.isArray(pathParam)
    ? pathParam
    : typeof pathParam === 'string' && pathParam.length > 0
      ? pathParam.split('/')
      : [];

  let best: { route: (typeof ROUTES)[number]; params: Record<string, string>; literalCount: number } | null = null;

  for (const route of ROUTES) {
    if (route.segments.length !== segments.length) continue;

    let matched = true;
    let literalCount = 0;
    const params: Record<string, string> = {};

    for (let i = 0; i < route.segments.length; i++) {
      const routeSeg = route.segments[i];
      const actual = segments[i];
      if (typeof routeSeg === 'string') {
        if (routeSeg !== actual) {
          matched = false;
          break;
        }
        literalCount++;
      } else {
        params[routeSeg.param] = actual;
      }
    }

    if (matched && (!best || literalCount > best.literalCount)) {
      best = { route, params, literalCount };
    }
  }

  if (!best) {
    // `route: false` distinguishes a genuine "no such API route" miss from a
    // handler's own legitimate "resource not found" 404 (several handlers
    // use the identical {error:'Not found'} shape for e.g. "no invoice with
    // that id") — harmless extra field for real clients, but makes this
    // unambiguous for monitoring/debugging and for automated route-coverage
    // testing (see __verify-router.ts).
    return res.status(404).json({ error: 'Not found', route: false });
  }

  for (const [key, value] of Object.entries(best.params)) {
    (req.query as Record<string, string | string[]>)[key] = value;
  }

  return best.route.handler(req, res);
}

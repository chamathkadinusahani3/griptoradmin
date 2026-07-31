import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireTenantPermission } from '../../auth.js';

// TEMPORARILY disabled — this used to create a Stripe Checkout Session for
// buying an individual module/add-on. Stripe was removed (doesn't support
// Sri Lankan merchants) in favor of PayHere; module/add-on purchasing is
// PayHere Phase 3, not built yet (see the plan file). Left as a real 501
// rather than deleting the route/frontend call site, so TenantDashboard.tsx
// gets an honest "not available yet" instead of a raw 404.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'billing:manage');
  if (!session) return;

  return res.status(501).json({ error: 'Module/add-on purchasing is temporarily unavailable while we switch payment providers. Please check back soon.' });
}

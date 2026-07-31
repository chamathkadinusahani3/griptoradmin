import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../../../auth.js';
import { PERMISSIONS } from '../../../permissions.js';

// The static taxonomy, for the Super Admin's per-user Permissions modal's
// checkbox matrix — same list the tenant-side Roles & Permissions page uses
// (api/_lib/routes/permissions/index.ts), just re-exposed under a
// super-auth-gated path since that one requires a tenant session.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = requireAuth(req, res, 'super');
  if (!session) return;

  return res.status(200).json({ permissions: PERMISSIONS });
}

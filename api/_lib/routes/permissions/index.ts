import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireTenant } from '../../auth.js';
import { PERMISSIONS } from '../../permissions.js';

// The static taxonomy, for the Roles & Permissions page's checkbox matrix —
// deliberately not derived from any existing Role's permissions (e.g.
// Manager) since Manager is a regular, deletable/editable role, not a
// guaranteed source of "every permission that exists."
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = requireTenant(req, res);
  if (!session) return;

  return res.status(200).json({ permissions: PERMISSIONS });
}

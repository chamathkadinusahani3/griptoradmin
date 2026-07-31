import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../../db.js';
import { requireAuth } from '../../../auth.js';
import { serializeRole } from '../../../serializers.js';
import { ensureRolesSeeded } from '../../../roleSeed.js';

// The tenant's role list, for the Super Admin's Create/Edit User modal's
// role picker — reuses the exact same seeding helper the tenant-side Roles
// page and staff invite endpoint already depend on.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = requireAuth(req, res, 'super');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing client id' });

  await connectToDatabase();
  const roles = await ensureRolesSeeded(id);
  return res.status(200).json({ roles: roles.map(serializeRole) });
}

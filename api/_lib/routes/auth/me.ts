import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { User, UserDoc } from '../../models/User.js';
import { Client, ClientDoc } from '../../models/Client.js';
import { Role, RoleDoc } from '../../models/Role.js';
import { requireAuth } from '../../auth.js';
import { serializeUser } from '../../serializers.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = requireAuth(req, res);
  if (!session) return; // requireAuth already sent the 401

  await connectToDatabase();

  const user = (await User.findById(session.sub).lean()) as UserDoc | null;
  if (!user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const client = user.clientId
    ? ((await Client.findById(user.clientId).lean()) as ClientDoc | null)
    : null;

  // The one place the frontend gets the full permission list — deliberately
  // in this infrequent response body, not baked into every request's JWT
  // (see auth.ts's requireTenantPermission doc comment for why).
  const role = user.roleId ? ((await Role.findById(user.roleId).lean()) as RoleDoc | null) : null;

  let impersonatorName: string | undefined;
  if (session.impersonatedBy) {
    const impersonator = (await User.findById(session.impersonatedBy).select('name').lean()) as { name: string } | null;
    impersonatorName = impersonator?.name;
  }

  return res.status(200).json({
    user: {
      ...serializeUser(
        user,
        client,
        role ? { id: role._id.toString(), name: role.name, permissions: role.permissions, isOwner: role.isProtectedOwner } : null
      ),
      impersonatedBy: session.impersonatedBy,
      impersonatorName,
    },
  });
}

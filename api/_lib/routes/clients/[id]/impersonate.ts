import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../../db.js';
import { Client, ClientDoc } from '../../../models/Client.js';
import { User, UserDoc } from '../../../models/User.js';
import { ImpersonationLog } from '../../../models/ImpersonationLog.js';
import { requireAuth, signSession, getRawSessionCookie, setImpersonationCookies } from '../../../auth.js';
import { ensureRolesSeeded, resolveUserRole } from '../../../roleSeed.js';
import { serializeClient } from '../../../serializers.js';

// Lets a Super Admin (Owner/Admin/Support — never Billing, principle of
// least privilege) temporarily act as a specific tenant's Owner, for
// support/troubleshooting. Every start is unconditionally logged
// (ImpersonationLog) — this is a genuinely sensitive action (full access to
// a live tenant's account), never opt-in auditing.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = requireAuth(req, res, 'super');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing client id' });

  await connectToDatabase();

  const superUser = (await User.findById(session.sub).select('teamRole').lean()) as { teamRole?: string } | null;
  if (superUser?.teamRole === 'Billing') {
    return res.status(403).json({ error: 'Billing team members cannot impersonate tenants' });
  }

  const client = (await Client.findById(id).lean()) as ClientDoc | null;
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const tenantUsers = (await User.find({ clientId: id, role: 'tenant' }).lean()) as UserDoc[];
  if (tenantUsers.length === 0) {
    return res.status(400).json({ error: 'This client has no staff accounts to impersonate' });
  }

  const roles = await ensureRolesSeeded(id);
  let owner: UserDoc | undefined;
  for (const u of tenantUsers) {
    const role = await resolveUserRole(u, roles);
    if (role.isProtectedOwner) {
      owner = u;
      break;
    }
  }
  if (!owner) return res.status(400).json({ error: 'This client has no Owner account to impersonate' });

  const rawSuperToken = getRawSessionCookie(req);
  if (!rawSuperToken) return res.status(401).json({ error: 'Not authenticated' });

  const ownerRole = roles.find((r) => r.isProtectedOwner)!;
  const tenantToken = signSession(
    {
      sub: owner._id.toString(),
      role: 'tenant',
      clientId: id,
      tenantRole: 'Owner',
      branchId: owner.branchId?.toString(),
      roleId: ownerRole._id.toString(),
      isOwner: true,
      branchPinned: false,
      requiresCreditLimit: false,
      impersonatedBy: session.sub,
    },
    4 * 60 * 60
  );

  await ImpersonationLog.create({ clientId: id, tenantUserId: owner._id, superAdminUserId: session.sub, startedAt: new Date() });

  setImpersonationCookies(res, tenantToken, rawSuperToken);

  return res.status(200).json({ client: serializeClient(client) });
}

import type { VercelRequest, VercelResponse } from '@vercel/node';
import bcrypt from 'bcryptjs';
import { connectToDatabase } from '../../db.js';
import { User, UserDoc } from '../../models/User.js';
import { Client, ClientDoc } from '../../models/Client.js';
import { signSession, setSessionCookie } from '../../auth.js';
import { serializeUser } from '../../serializers.js';
import { applyPublicCorsWithCredentials } from '../../cors.js';
import { getOrResolveUserRole } from '../../roleSeed.js';

// Cross-origin-callable from griptorweb's own /login form (a real session
// cookie set here works once the browser is redirected to griptoradmin,
// since the cookie is sameSite:'lax' scoped to this origin, not the
// caller's — see griptorweb's LoginPage.tsx for the full flow). Still
// works exactly as before for griptoradmin's own same-origin login page.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyPublicCorsWithCredentials(req, res)) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, password } = (req.body ?? {}) as { email?: string; password?: string };
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  await connectToDatabase();

  const user = (await User.findOne({ email: email.toLowerCase().trim() }).lean()) as UserDoc | null;
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const client = user.clientId
    ? ((await Client.findById(user.clientId).lean()) as ClientDoc | null)
    : null;

  // Real enforcement for a suspended subscription (Phase B) — until now
  // Client.status was purely cosmetic, never actually blocking anything.
  // Deliberately checked only at login, not on every requireTenant call:
  // clientId is embedded in the JWT specifically so tenant requests don't
  // need a DB lookup on every call (see auth.ts's own comment on
  // requireTenant) — adding one here would undo that. A tenant suspended
  // mid-session keeps access until their next login.
  if (user.role === 'tenant' && client?.status === 'Suspended') {
    return res.status(403).json({ error: 'This garage\'s subscription is suspended. Please contact support.' });
  }

  // A deactivated individual account (Super Admin-driven, distinct from a
  // suspended Client/garage as a whole) — same "checked at login only" call
  // as the Suspended check above, same reasoning.
  if (user.status === 'Deactivated') {
    return res.status(403).json({ error: 'This account has been deactivated. Please contact your administrator.' });
  }

  const statusUpdate: Record<string, unknown> = { lastLoginAt: new Date() };
  if (user.status === 'Invited') statusUpdate.status = 'Active';
  await User.updateOne({ _id: user._id }, statusUpdate);
  user.status = 'Active';

  // Seeds this tenant's 5 default Role docs the first time any of its staff
  // logs in after this shipped, and resolves+persists this User's roleId
  // (idempotent, self-healing — see roleSeed.ts's doc comments).
  const role = user.role === 'tenant' ? await getOrResolveUserRole(user) : null;

  const token = signSession({
    sub: user._id.toString(),
    role: user.role as 'super' | 'tenant',
    clientId: user.clientId?.toString(),
    // Defaults every pre-existing single-login garage owner to real Owner
    // access with zero migration — same backfill-at-read discipline as
    // serializeUser below.
    tenantRole: user.role === 'tenant' ? (user.tenantRole as 'Owner' | 'Manager' | 'Technician' | 'Cashier' | 'Sales Executive' | undefined) ?? 'Owner' : undefined,
    branchId: user.branchId?.toString(),
    roleId: role?._id.toString(),
    isOwner: role?.isProtectedOwner ?? false,
    branchPinned: role?.branchPinned ?? false,
    requiresCreditLimit: role?.requiresCreditLimit ?? false,
  });
  setSessionCookie(res, token);

  return res.status(200).json({
    user: serializeUser(
      user,
      client,
      role ? { id: role._id.toString(), name: role.name, permissions: role.permissions, isOwner: role.isProtectedOwner } : null
    ),
  });
}

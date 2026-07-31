import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { User, UserDoc } from '../../models/User.js';
import { ImpersonationLog } from '../../models/ImpersonationLog.js';
import {
  getSessionFromRequest,
  getRawImpersonatorCookie,
  getImpersonatorSessionFromRequest,
  restoreFromImpersonation,
  clearSessionCookie,
  clearImpersonatorCookie,
} from '../../auth.js';
import { serializeUser } from '../../serializers.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawSuperToken = getRawImpersonatorCookie(req);
  const superSession = getImpersonatorSessionFromRequest(req);

  await connectToDatabase();

  // Close out the audit record regardless of whether the stashed super
  // session is still valid — an expired admin session shouldn't leave the
  // impersonation log looking permanently "in progress."
  const currentSession = getSessionFromRequest(req);
  if (currentSession?.impersonatedBy) {
    // Only ever one open (endedAt-less) log per tenantUserId+superAdminUserId
    // pair at a time in practice (impersonation is single-session), so a
    // plain updateOne (no sort needed) is enough.
    await ImpersonationLog.updateOne(
      { clientId: currentSession.clientId, tenantUserId: currentSession.sub, superAdminUserId: currentSession.impersonatedBy, endedAt: { $exists: false } },
      { endedAt: new Date() }
    );
  }

  if (!rawSuperToken || !superSession) {
    // Nothing to restore (expired or never impersonating) — just clear both
    // cookies and send them back to login rather than erroring.
    clearSessionCookie(res);
    clearImpersonatorCookie(res);
    return res.status(200).json({ ok: true, restored: false });
  }

  const superUser = (await User.findById(superSession.sub).lean()) as UserDoc | null;
  if (!superUser) {
    clearSessionCookie(res);
    clearImpersonatorCookie(res);
    return res.status(200).json({ ok: true, restored: false });
  }

  restoreFromImpersonation(res, rawSuperToken);
  return res.status(200).json({ ok: true, restored: true, user: serializeUser(superUser) });
}

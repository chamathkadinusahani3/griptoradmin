import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Client, ClientDoc } from '../../models/Client.js';
import { requireTenantPermission } from '../../auth.js';
import { buildPlanCheckoutFields, getCheckoutActionUrl } from '../../payhere.js';
import { resolveAppOrigin } from '../../url.js';

const SELF_SERVE_PLANS = ['Starter', 'Professional'] as const;
type SelfServePlan = (typeof SELF_SERVE_PLANS)[number];

interface SetupPaymentBody {
  plan?: string;
}

// Real payment setup for a tenant's own Starter/Professional plan — either
// their first-ever payment (trial ending, or paying early) or switching
// plans (starts a NEW recurring subscription; the caller's own UI must warn
// that the OLD one isn't auto-cancelled — no OAuth Subscription Manager API
// yet, see the plan file). Owner/Manager only, same boundary as the rest of
// api/tenant/*. Enterprise is never self-serve here either.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'billing:manage');
  if (!session) return;

  const { plan } = (req.body ?? {}) as SetupPaymentBody;
  if (!plan || !SELF_SERVE_PLANS.includes(plan as SelfServePlan)) {
    return res.status(400).json({ error: 'plan must be "Starter" or "Professional" — contact sales for Enterprise' });
  }

  await connectToDatabase();
  const client = (await Client.findById(session.clientId).lean()) as ClientDoc | null;
  if (!client) return res.status(404).json({ error: 'Garage not found' });

  // Only block a genuine no-op (already paying for exactly this plan) — a
  // first-time setup (no payhereSubscriptionId yet) is always allowed
  // regardless of the client's currently-recorded `plan` field.
  if (client.payhereSubscriptionId && client.plan === plan) {
    return res.status(400).json({ error: `Already on the ${plan} plan` });
  }

  try {
    const origin = resolveAppOrigin(req);
    const fields = buildPlanCheckoutFields(client, plan as SelfServePlan, {
      returnUrl: `${origin}/app/settings?planSetup=1`,
      cancelUrl: `${origin}/app/settings?planSetup=0`,
      notifyUrl: `${origin}/api/public/payhere-notify`,
    });
    return res.status(200).json({ actionUrl: getCheckoutActionUrl(), fields });
  } catch (err) {
    return res.status(502).json({ error: err instanceof Error ? err.message : 'Failed to start payment setup' });
  }
}

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Client, ClientDoc } from '../../models/Client.js';
import { requireAuth } from '../../auth.js';
import { serializeClient } from '../../serializers.js';
import { computeMrr, isValidPlanName } from '../../pricing.js';
import { applyPlanChange } from '../../planChange.js';

interface UpdateClientBody {
  plan?: string;
  status?: 'Active' | 'Trial' | 'Suspended';
  locations?: number;
  staff?: number;
  modules?: string[];
  addOns?: string[];
  disabledCoreFeatures?: string[];
  branding?: {
    paletteId?: string;
    logoDataUrl?: string | null;
    defaultMode?: 'light' | 'dark';
    accentColor?: string | null;
    sidebarStyle?: 'expanded' | 'compact';
    fontFamily?: string;
  };
}

// Generous cap on the stored base64 logo string — client-side already resizes
// to well under this before upload; this is just a server-side backstop.
const MAX_LOGO_DATA_URL_LENGTH = 2_000_000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'PATCH') return handlePatch(req, res);
  res.setHeader('Allow', 'GET, PATCH');
  return res.status(405).json({ error: 'Method not allowed' });
}

function getId(req: VercelRequest): string | null {
  const { id } = req.query;
  return typeof id === 'string' ? id : null;
}

async function handleGet(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res, 'super')) return;

  const id = getId(req);
  if (!id) return res.status(400).json({ error: 'Missing client id' });

  await connectToDatabase();
  const client = (await Client.findById(id).lean()) as ClientDoc | null;
  if (!client) return res.status(404).json({ error: 'Client not found' });

  return res.status(200).json({ client: serializeClient(client) });
}

async function handlePatch(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res, 'super')) return;

  const id = getId(req);
  if (!id) return res.status(400).json({ error: 'Missing client id' });

  const { plan, status, locations, staff, modules, addOns, branding, disabledCoreFeatures } = (req.body ?? {}) as UpdateClientBody;

  if (branding?.logoDataUrl && branding.logoDataUrl.length > MAX_LOGO_DATA_URL_LENGTH) {
    return res.status(400).json({ error: 'Logo image is too large' });
  }

  await connectToDatabase();
  const existing = (await Client.findById(id).lean()) as ClientDoc | null;
  if (!existing) return res.status(404).json({ error: 'Client not found' });

  if (plan !== undefined && !(await isValidPlanName(plan))) {
    return res.status(400).json({ error: `Unknown plan: ${plan}` });
  }

  const update: Record<string, unknown> = {};
  if (plan !== undefined) update.plan = plan;
  if (status !== undefined) update.status = status;
  if (locations !== undefined) update.locations = locations;
  if (staff !== undefined) update.staff = staff;
  if (modules !== undefined) update.modules = modules;
  if (addOns !== undefined) update.addOns = addOns;
  if (disabledCoreFeatures !== undefined) update.disabledCoreFeatures = disabledCoreFeatures;
  if (branding !== undefined) {
    update.branding = {
      paletteId: existing.branding?.paletteId ?? 'blue',
      logoDataUrl: existing.branding?.logoDataUrl,
      defaultMode: existing.branding?.defaultMode ?? 'light',
      accentColor: existing.branding?.accentColor,
      sidebarStyle: existing.branding?.sidebarStyle ?? 'expanded',
      fontFamily: existing.branding?.fontFamily ?? 'Inter',
      ...branding,
    };
  }
  if (plan !== undefined || status !== undefined) {
    update.mrr = await computeMrr(plan ?? existing.plan, status ?? existing.status, existing.mrr);
  }

  // Real Stripe subscription sync on an actual plan change (api/_lib/planChange.ts)
  // — the local plan/mrr write above is an optimistic placeholder; a
  // Stripe-managed client's true mrr/plan get corrected shortly after by the
  // resulting customer.subscription.updated webhook.
  if (plan !== undefined) {
    Object.assign(update, await applyPlanChange(existing, plan));
  }

  const client = (await Client.findByIdAndUpdate(id, update, { returnDocument: 'after' }).lean()) as ClientDoc;
  return res.status(200).json({ client: serializeClient(client) });
}

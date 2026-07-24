import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../_lib/db';
import { Client, ClientDoc } from '../_lib/models/Client';
import { requireTenantManager } from '../_lib/auth';
import { serializeClient } from '../_lib/serializers';

interface UpdateSettingsBody {
  name?: string;
  contact?: string;
  email?: string;
  branding?: {
    paletteId?: string;
    logoDataUrl?: string | null;
    defaultMode?: 'light' | 'dark';
  };
}

// Same server-side backstop as api/clients/[id].ts's MAX_LOGO_DATA_URL_LENGTH.
const MAX_LOGO_DATA_URL_LENGTH = 2_000_000;

// Self-service garage profile + branding — closes the gap flagged in
// api/tenant/sms-config.ts's own comment ("branding/other Client fields are
// still super-admin-edited"). Owner/Manager only (requireTenantManager),
// scoped strictly to the caller's own session.clientId — never an :id param.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = requireTenantManager(req, res);
  if (!session) return;

  const { name, contact, email, branding } = (req.body ?? {}) as UpdateSettingsBody;

  if (name !== undefined && !name.trim()) {
    return res.status(400).json({ error: 'Garage name cannot be empty' });
  }
  if (contact !== undefined && !contact.trim()) {
    return res.status(400).json({ error: 'Contact name cannot be empty' });
  }
  if (email !== undefined && !email.trim()) {
    return res.status(400).json({ error: 'Email cannot be empty' });
  }
  if (branding?.logoDataUrl && branding.logoDataUrl.length > MAX_LOGO_DATA_URL_LENGTH) {
    return res.status(400).json({ error: 'Logo image is too large' });
  }

  await connectToDatabase();
  const existing = (await Client.findById(session.clientId).lean()) as ClientDoc | null;
  if (!existing) return res.status(404).json({ error: 'Garage not found' });

  const update: Record<string, unknown> = {};
  if (name !== undefined) update.name = name.trim();
  if (contact !== undefined) update.contact = contact.trim();
  if (email !== undefined) update.email = email.trim().toLowerCase();
  if (branding !== undefined) {
    update.branding = {
      paletteId: existing.branding?.paletteId ?? 'blue',
      logoDataUrl: existing.branding?.logoDataUrl,
      defaultMode: existing.branding?.defaultMode ?? 'light',
      ...branding,
    };
  }

  const client = (await Client.findOneAndUpdate(
    { _id: session.clientId },
    update,
    { returnDocument: 'after' }
  ).lean()) as ClientDoc;

  return res.status(200).json({ client: serializeClient(client) });
}

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../../db.js';
import { Client, ClientDoc } from '../../../models/Client.js';

// Public, unauthenticated — lets the staff/tenant-admin login page
// (/login/:slug) show a tenant's logo, name, and color palette before the
// user has typed a password. Only the safe subset of Client.branding is
// returned; the submitted login itself is unaffected by this endpoint (the
// slug is cosmetic pre-login branding only — auth still resolves the
// tenant from the authenticated user's email, same as generic /login).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { slug } = req.query;
  if (typeof slug !== 'string') return res.status(400).json({ error: 'Missing slug' });

  await connectToDatabase();
  const client = (await Client.findOne({ slug }).lean()) as ClientDoc | null;
  if (!client) return res.status(404).json({ error: 'Not found' });

  return res.status(200).json({
    name: client.name,
    branding: {
      logoDataUrl: client.branding?.logoDataUrl,
      paletteId: client.branding?.paletteId,
      accentColor: client.branding?.accentColor,
    },
  });
}

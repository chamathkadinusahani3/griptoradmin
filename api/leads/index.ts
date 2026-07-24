import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../_lib/db';
import { Lead, LeadDoc } from '../_lib/models/Lead';
import { requireAuth } from '../_lib/auth';
import { serializeLead } from '../_lib/serializers';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!requireAuth(req, res, 'super')) return;

  await connectToDatabase();
  const leads = (await Lead.find().sort({ createdAt: -1 }).lean()) as LeadDoc[];
  return res.status(200).json({ leads: leads.map(serializeLead) });
}

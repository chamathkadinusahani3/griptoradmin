import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../_lib/db';
import { Lead, LeadDoc } from '../_lib/models/Lead';
import { requireAuth } from '../_lib/auth';
import { serializeLead } from '../_lib/serializers';

interface UpdateLeadBody {
  status?: 'New' | 'Contacted' | 'Converted';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!requireAuth(req, res, 'super')) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing lead id' });

  const { status } = (req.body ?? {}) as UpdateLeadBody;
  if (!status) return res.status(400).json({ error: 'status is required' });

  await connectToDatabase();
  const lead = (await Lead.findByIdAndUpdate(id, { status }, { returnDocument: 'after' }).lean()) as LeadDoc | null;
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  return res.status(200).json({ lead: serializeLead(lead) });
}

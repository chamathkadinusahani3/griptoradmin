import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Lead } from '../../models/Lead.js';
import { applyPublicCors } from '../../cors.js';
import { serializeLead } from '../../serializers.js';

interface SubmitLeadBody {
  name?: string;
  email?: string;
  company?: string;
  businessType?: string;
  message?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyPublicCors(req, res)) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, email, company, businessType, message } = (req.body ?? {}) as SubmitLeadBody;
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'name, email, and message are required' });
  }

  await connectToDatabase();
  const lead = await Lead.create({
    name,
    email: email.toLowerCase().trim(),
    company,
    businessType,
    message,
    status: 'New',
  });

  return res.status(201).json({ lead: serializeLead(lead.toObject()) });
}

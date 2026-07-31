import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../../../db.js';
import { Client, ClientDoc } from '../../../../models/Client.js';
import { computeSlotAvailability } from '../../../../bookingAvailability.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { slug, date, branchId } = req.query;
  if (typeof slug !== 'string') return res.status(400).json({ error: 'Missing slug' });
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
  }

  await connectToDatabase();
  const client = (await Client.findOne({ slug }).lean()) as ClientDoc | null;
  if (!client) return res.status(404).json({ error: 'Not found' });

  const slots = await computeSlotAvailability(client, date, typeof branchId === 'string' ? branchId : undefined);
  return res.status(200).json({ slots });
}

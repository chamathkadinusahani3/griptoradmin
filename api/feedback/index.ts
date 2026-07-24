import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../_lib/db';
import { Feedback, FeedbackDoc } from '../_lib/models/Feedback';
import { Customer, CustomerDoc } from '../_lib/models/Customer';
import { requireTenant } from '../_lib/auth';
import { serializeFeedback } from '../_lib/serializers';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = requireTenant(req, res);
  if (!session) return;

  await connectToDatabase();
  const feedback = (await Feedback.find({ clientId: session.clientId }).sort({ createdAt: -1 }).lean()) as FeedbackDoc[];
  const customers = (await Customer.find({ clientId: session.clientId }).lean()) as CustomerDoc[];
  const nameById = new Map(customers.map((c) => [c._id.toString(), c.name]));

  return res.status(200).json({
    feedback: feedback.map((f) => serializeFeedback(f, nameById.get(f.customerId.toString()))),
  });
}

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Feedback, FeedbackDoc } from '../../models/Feedback.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeFeedback } from '../../serializers.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'feedback:view');
  if (!session) return;

  await connectToDatabase();
  const feedback = (await Feedback.find({ clientId: session.clientId }).sort({ createdAt: -1 }).lean()) as FeedbackDoc[];
  const customers = (await Customer.find({ clientId: session.clientId }).lean()) as CustomerDoc[];
  const nameById = new Map(customers.map((c) => [c._id.toString(), c.name]));

  return res.status(200).json({
    feedback: feedback.map((f) => serializeFeedback(f, nameById.get(f.customerId.toString()))),
  });
}

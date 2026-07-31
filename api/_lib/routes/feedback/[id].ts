import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Feedback, FeedbackDoc } from '../../models/Feedback.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeFeedback } from '../../serializers.js';

interface UpdateFeedbackBody {
  responded?: boolean;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'feedback:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing feedback id' });

  const { responded } = (req.body ?? {}) as UpdateFeedbackBody;
  if (responded === undefined) return res.status(400).json({ error: 'responded is required' });

  await connectToDatabase();
  const feedback = (await Feedback.findOneAndUpdate(
    { _id: id, clientId: session.clientId },
    { responded },
    { returnDocument: 'after' }
  ).lean()) as FeedbackDoc | null;
  if (!feedback) return res.status(404).json({ error: 'Feedback not found' });

  const customer = (await Customer.findById(feedback.customerId).lean()) as CustomerDoc | null;
  return res.status(200).json({ feedback: serializeFeedback(feedback, customer?.name) });
}

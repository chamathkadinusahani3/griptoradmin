import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Reminder, ReminderDoc } from '../../models/Reminder.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeReminder } from '../../serializers.js';

interface UpdateReminderBody {
  status?: 'Scheduled' | 'Sent' | 'Failed';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'reminders:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing reminder id' });

  const { status } = (req.body ?? {}) as UpdateReminderBody;
  if (!status) return res.status(400).json({ error: 'status is required' });

  await connectToDatabase();
  const reminder = (await Reminder.findOneAndUpdate(
    { _id: id, clientId: session.clientId },
    { status },
    { returnDocument: 'after' }
  ).lean()) as ReminderDoc | null;
  if (!reminder) return res.status(404).json({ error: 'Reminder not found' });

  const customer = (await Customer.findById(reminder.customerId).lean()) as CustomerDoc | null;
  return res.status(200).json({ reminder: serializeReminder(reminder, customer?.name) });
}

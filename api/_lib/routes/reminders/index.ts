import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Reminder, ReminderDoc } from '../../models/Reminder.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeReminder } from '../../serializers.js';

interface CreateReminderBody {
  customerId?: string;
  vehicle?: string;
  type?: string;
  channel?: 'SMS' | 'WhatsApp' | 'Email';
  scheduledFor?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'reminders:view');
  if (!session) return;

  await connectToDatabase();
  const reminders = (await Reminder.find({ clientId: session.clientId }).sort({ scheduledFor: 1 }).lean()) as ReminderDoc[];
  const customers = (await Customer.find({ clientId: session.clientId }).lean()) as CustomerDoc[];
  const nameById = new Map(customers.map((c) => [c._id.toString(), c.name]));

  return res.status(200).json({
    reminders: reminders.map((r) => serializeReminder(r, nameById.get(r.customerId.toString()))),
  });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'reminders:manage');
  if (!session) return;

  const { customerId, vehicle, type, channel, scheduledFor } = (req.body ?? {}) as CreateReminderBody;
  if (!customerId || !type || !channel || !scheduledFor) {
    return res.status(400).json({ error: 'customerId, type, channel, and scheduledFor are required' });
  }

  await connectToDatabase();
  const customer = await Customer.findOne({ _id: customerId, clientId: session.clientId }).lean();
  if (!customer) return res.status(400).json({ error: 'Unknown customer' });

  const reminder = await Reminder.create({
    clientId: session.clientId,
    customerId,
    vehicle,
    type,
    channel,
    scheduledFor: new Date(scheduledFor),
  });

  return res.status(201).json({ reminder: serializeReminder(reminder.toObject(), (customer as CustomerDoc).name) });
}

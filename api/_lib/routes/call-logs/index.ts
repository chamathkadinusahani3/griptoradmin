import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { CallLog, CallLogDoc } from '../../models/CallLog.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { Reminder } from '../../models/Reminder.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeCallLog } from '../../serializers.js';

interface CreateCallLogBody {
  customerId?: string;
  direction?: 'Inbound' | 'Outbound';
  reason?: string;
  status?: 'Open' | 'Resolved' | 'Escalated';
  durationMinutes?: number;
  notes?: string;
  followUpDue?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'call-logs:view');
  if (!session) return;

  await connectToDatabase();
  const calls = (await CallLog.find({ clientId: session.clientId }).sort({ createdAt: -1 }).lean()) as CallLogDoc[];
  const customers = (await Customer.find({ clientId: session.clientId }).lean()) as CustomerDoc[];
  const customerNameById = new Map(customers.map((c) => [c._id.toString(), c.name]));

  return res.status(200).json({ callLogs: calls.map((c) => serializeCallLog(c, customerNameById.get(c.customerId.toString()))) });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'call-logs:manage');
  if (!session) return;

  const { customerId, direction, reason, status, durationMinutes, notes, followUpDue } = (req.body ?? {}) as CreateCallLogBody;
  if (!customerId || !direction || !reason) {
    return res.status(400).json({ error: 'customerId, direction, and reason are required' });
  }

  await connectToDatabase();

  const customer = (await Customer.findOne({ _id: customerId, clientId: session.clientId }).lean()) as CustomerDoc | null;
  if (!customer) return res.status(400).json({ error: 'Unknown customer' });

  // Real cross-feature wiring validated by the Anura reference: a call
  // logged with a follow-up date creates a real Reminder, reusing the
  // existing model rather than inventing a separate calendar-event concept.
  let reminderId: string | undefined;
  if (followUpDue) {
    const reminder = await Reminder.create({
      clientId: session.clientId,
      customerId,
      type: 'Follow-up',
      channel: 'SMS',
      scheduledFor: new Date(followUpDue),
    });
    reminderId = reminder._id.toString();
  }

  const call = await CallLog.create({
    clientId: session.clientId,
    customerId,
    direction,
    reason,
    status: status ?? 'Open',
    durationMinutes,
    notes,
    followUpDue: followUpDue ? new Date(followUpDue) : undefined,
    reminderId,
  });

  return res.status(201).json({ callLog: serializeCallLog(call.toObject(), customer.name) });
}

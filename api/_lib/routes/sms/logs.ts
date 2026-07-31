import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { SmsLog, SmsLogDoc } from '../../models/SmsLog.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeSmsLog } from '../../serializers.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'sms:view');
  if (!session) return;

  const { source, limit } = req.query;
  const cappedLimit = Math.min(200, Math.max(1, Number(Array.isArray(limit) ? limit[0] : limit) || 50));
  const query: Record<string, unknown> = { clientId: session.clientId };
  if (typeof source === 'string') query.source = source;

  await connectToDatabase();
  const logs = (await SmsLog.find(query).sort({ createdAt: -1 }).limit(cappedLimit).lean()) as SmsLogDoc[];
  const customerIds = [...new Set(logs.map((l) => l.customerId?.toString()).filter(Boolean) as string[])];
  const customers = (await Customer.find({ _id: { $in: customerIds } }).lean()) as CustomerDoc[];
  const customerNameById = new Map(customers.map((c) => [c._id.toString(), c.name]));

  return res.status(200).json({
    logs: logs.map((l) => serializeSmsLog(l, l.customerId ? customerNameById.get(l.customerId.toString()) : undefined)),
  });
}

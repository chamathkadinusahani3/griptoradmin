import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../_lib/db';
import { SmsLog, SmsLogDoc } from '../_lib/models/SmsLog';
import { Customer, CustomerDoc } from '../_lib/models/Customer';
import { requireTenant } from '../_lib/auth';
import { serializeSmsLog } from '../_lib/serializers';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = requireTenant(req, res);
  if (!session) return;

  await connectToDatabase();
  const logs = (await SmsLog.find({ clientId: session.clientId }).sort({ createdAt: -1 }).limit(50).lean()) as SmsLogDoc[];
  const customerIds = [...new Set(logs.map((l) => l.customerId?.toString()).filter(Boolean) as string[])];
  const customers = (await Customer.find({ _id: { $in: customerIds } }).lean()) as CustomerDoc[];
  const customerNameById = new Map(customers.map((c) => [c._id.toString(), c.name]));

  return res.status(200).json({
    logs: logs.map((l) => serializeSmsLog(l, l.customerId ? customerNameById.get(l.customerId.toString()) : undefined)),
  });
}

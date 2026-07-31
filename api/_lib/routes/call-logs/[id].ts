import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { CallLog, CallLogDoc } from '../../models/CallLog.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeCallLog } from '../../serializers.js';

interface UpdateCallLogBody {
  status?: 'Open' | 'Resolved' | 'Escalated';
  notes?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'call-logs:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing call log id' });

  await connectToDatabase();

  const existing = await CallLog.findOne({ _id: id, clientId: session.clientId }).lean();
  if (!existing) return res.status(404).json({ error: 'Call log not found' });

  const body = (req.body ?? {}) as UpdateCallLogBody;
  const update: Record<string, unknown> = {};
  for (const key of ['status', 'notes'] as const) {
    if (body[key] !== undefined) update[key] = body[key];
  }

  const call = (await CallLog.findOneAndUpdate(
    { _id: id, clientId: session.clientId },
    update,
    { returnDocument: 'after' }
  ).lean()) as CallLogDoc;
  const customer = (await Customer.findById(call.customerId).lean()) as CustomerDoc | null;

  return res.status(200).json({ callLog: serializeCallLog(call, customer?.name) });
}

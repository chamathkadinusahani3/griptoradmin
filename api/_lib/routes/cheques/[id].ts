import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Cheque, ChequeDoc } from '../../models/Cheque.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeCheque } from '../../serializers.js';

interface UpdateChequeBody {
  action?: 'extend' | 'deposit' | 'clear';
  dueDate?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'cheques:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing cheque id' });

  const { action, dueDate } = (req.body ?? {}) as UpdateChequeBody;
  await connectToDatabase();

  const existing = (await Cheque.findOne({ _id: id, clientId: session.clientId }).lean()) as ChequeDoc | null;
  if (!existing) return res.status(404).json({ error: 'Cheque not found' });
  if (existing.status === 'Returned') return res.status(400).json({ error: 'This cheque has already been returned — nothing more to do' });

  let update: Record<string, unknown>;
  if (action === 'extend') {
    if (!dueDate) return res.status(400).json({ error: 'dueDate is required to extend a cheque' });
    const parsed = new Date(dueDate);
    if (Number.isNaN(parsed.getTime())) return res.status(400).json({ error: 'Invalid dueDate' });
    update = { dueDate: parsed };
  } else if (action === 'deposit') {
    if (existing.status !== 'Issued') return res.status(400).json({ error: 'Only an Issued cheque can be marked Deposited' });
    update = { status: 'Deposited' };
  } else if (action === 'clear') {
    if (existing.status !== 'Deposited') return res.status(400).json({ error: 'Only a Deposited cheque can be marked Cleared' });
    update = { status: 'Cleared' };
  } else {
    return res.status(400).json({ error: 'action must be "extend", "deposit", or "clear"' });
  }

  const cheque = (await Cheque.findOneAndUpdate({ _id: id, clientId: session.clientId }, update, { returnDocument: 'after' }).lean()) as ChequeDoc;
  return res.status(200).json({ cheque: serializeCheque(cheque) });
}

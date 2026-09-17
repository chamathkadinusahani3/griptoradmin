import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { CreditNote, CreditNoteDoc } from '../../models/CreditNote.js';
import { Return, ReturnDoc } from '../../models/Return.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeCreditNote } from '../../serializers.js';

// Read-only — a Credit Note is only ever created as a side effect of a
// customer-direction return (routes/returns/index.ts), never entered
// directly. Its own status can change afterward via [id].ts (void).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'credit-notes:view');
  if (!session) return;

  const { status } = req.query;
  await connectToDatabase();

  const filter: Record<string, unknown> = { clientId: session.clientId };
  if (typeof status === 'string') filter.status = status;

  const notes = (await CreditNote.find(filter).sort({ createdAt: -1 }).lean()) as CreditNoteDoc[];
  if (notes.length === 0) return res.status(200).json({ creditNotes: [] });

  const returnIds = [...new Set(notes.map((n) => n.returnId.toString()))];
  const returns = (await Return.find({ _id: { $in: returnIds }, clientId: session.clientId }).select('returnNumber').lean()) as ReturnDoc[];
  const returnNumberById = new Map(returns.map((r) => [r._id.toString(), r.returnNumber]));

  return res.status(200).json({
    creditNotes: notes.map((n) => serializeCreditNote(n, returnNumberById.get(n.returnId.toString()))),
  });
}

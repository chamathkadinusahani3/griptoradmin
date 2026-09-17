import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { CreditNote, CreditNoteDoc } from '../../models/CreditNote.js';
import { Return, ReturnDoc } from '../../models/Return.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeCreditNote } from '../../serializers.js';

interface UpdateCreditNoteBody {
  action?: 'void';
  reason?: string;
}

// Voiding is the only mutation a Credit Note supports — correcting one
// issued in error. Doesn't touch the underlying Return or reverse any GL
// entry (the Credit Note never posted one of its own — see CreditNote.ts).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'credit-notes:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing credit note id' });

  const { action, reason } = (req.body ?? {}) as UpdateCreditNoteBody;
  if (action !== 'void') return res.status(400).json({ error: 'action must be "void"' });
  if (!reason?.trim()) return res.status(400).json({ error: 'A reason is required to void a credit note' });

  await connectToDatabase();

  const existing = (await CreditNote.findOne({ _id: id, clientId: session.clientId }).lean()) as CreditNoteDoc | null;
  if (!existing) return res.status(404).json({ error: 'Credit note not found' });
  if (existing.status === 'Void') return res.status(400).json({ error: 'This credit note is already void' });

  const note = (await CreditNote.findOneAndUpdate(
    { _id: id, clientId: session.clientId, status: { $ne: 'Void' } },
    { status: 'Void', voidedAt: new Date(), voidReason: reason.trim() },
    { returnDocument: 'after' }
  ).lean()) as CreditNoteDoc | null;
  if (!note) return res.status(400).json({ error: 'This credit note changed status — refresh and try again' });

  const parentReturn = (await Return.findById(note.returnId).select('returnNumber').lean()) as ReturnDoc | null;
  return res.status(200).json({ creditNote: serializeCreditNote(note, parentReturn?.returnNumber) });
}

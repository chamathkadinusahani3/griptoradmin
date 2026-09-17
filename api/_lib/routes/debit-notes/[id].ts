import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { DebitNote, DebitNoteDoc } from '../../models/DebitNote.js';
import { Return, ReturnDoc } from '../../models/Return.js';
import { Supplier, SupplierDoc } from '../../models/Supplier.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeDebitNote } from '../../serializers.js';
import { respondToApprovalGate } from '../../approvalGate.js';

interface UpdateDebitNoteBody {
  action?: 'confirm' | 'void';
  reason?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'debit-notes:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing debit note id' });

  const { action, reason } = (req.body ?? {}) as UpdateDebitNoteBody;
  if (action !== 'confirm' && action !== 'void') return res.status(400).json({ error: 'action must be "confirm" or "void"' });

  await connectToDatabase();

  const existing = (await DebitNote.findOne({ _id: id, clientId: session.clientId }).lean()) as DebitNoteDoc | null;
  if (!existing) return res.status(404).json({ error: 'Debit note not found' });

  let note: DebitNoteDoc | null;
  if (action === 'confirm') {
    if (existing.status !== 'Pending') return res.status(400).json({ error: 'Only a Pending debit note can be confirmed' });
    note = await respondToApprovalGate<DebitNoteDoc>(DebitNote, { _id: id, clientId: session.clientId }, 'Pending', 'Confirmed', session.sub);
    if (!note) return res.status(400).json({ error: 'This debit note changed status — refresh and try again' });
  } else {
    if (existing.status === 'Void') return res.status(400).json({ error: 'This debit note is already void' });
    if (!reason?.trim()) return res.status(400).json({ error: 'A reason is required to void a debit note' });
    note = (await DebitNote.findOneAndUpdate(
      { _id: id, clientId: session.clientId, status: { $ne: 'Void' } },
      { status: 'Void', voidedAt: new Date(), voidReason: reason.trim() },
      { returnDocument: 'after' }
    ).lean()) as DebitNoteDoc | null;
    if (!note) return res.status(400).json({ error: 'This debit note changed status — refresh and try again' });
  }

  const [parentReturn, supplier] = await Promise.all([
    Return.findById(note.returnId).select('returnNumber').lean() as Promise<ReturnDoc | null>,
    Supplier.findById(note.supplierId).select('name').lean() as Promise<SupplierDoc | null>,
  ]);

  return res.status(200).json({ debitNote: serializeDebitNote(note, parentReturn?.returnNumber, supplier?.name) });
}

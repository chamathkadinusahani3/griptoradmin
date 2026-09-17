import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { EffectiveNote, EffectiveNoteDoc } from '../../models/EffectiveNote.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { WarrantyClaim, WarrantyClaimDoc } from '../../models/WarrantyClaim.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeEffectiveNote } from '../../serializers.js';

interface UpdateEffectiveNoteBody {
  action?: 'void';
  reason?: string;
}

// Voiding is the only mutation an Effective Note supports — correcting one
// entered in error, same shape as credit-notes/[id].ts. Doesn't reverse any
// GL entry (this document never posted one of its own — see
// EffectiveNote.ts). If some of it was already applied via Utilization,
// that application stays on the record — same append-only discipline as
// every other Utilization source in this codebase.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'effective-notes:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing effective note id' });

  const { action, reason } = (req.body ?? {}) as UpdateEffectiveNoteBody;
  if (action !== 'void') return res.status(400).json({ error: 'action must be "void"' });
  if (!reason?.trim()) return res.status(400).json({ error: 'A reason is required to void an effective note' });

  await connectToDatabase();

  const existing = (await EffectiveNote.findOne({ _id: id, clientId: session.clientId }).lean()) as EffectiveNoteDoc | null;
  if (!existing) return res.status(404).json({ error: 'Effective note not found' });
  if (existing.status === 'Void') return res.status(400).json({ error: 'This effective note is already void' });

  const note = (await EffectiveNote.findOneAndUpdate(
    { _id: id, clientId: session.clientId, status: { $ne: 'Void' } },
    { status: 'Void', voidedAt: new Date(), voidReason: reason.trim() },
    { returnDocument: 'after' }
  ).lean()) as EffectiveNoteDoc | null;
  if (!note) return res.status(400).json({ error: 'This effective note changed status — refresh and try again' });

  const customer = (await Customer.findById(note.customerId).select('name').lean()) as CustomerDoc | null;
  const claim = note.warrantyClaimId
    ? ((await WarrantyClaim.findById(note.warrantyClaimId).select('claimNumber').lean()) as WarrantyClaimDoc | null)
    : null;
  return res.status(200).json({
    effectiveNote: serializeEffectiveNote(note, { customerName: customer?.name, warrantyClaimNumber: claim?.claimNumber }),
  });
}

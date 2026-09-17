import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { DebitNote, DebitNoteDoc } from '../../models/DebitNote.js';
import { Return, ReturnDoc } from '../../models/Return.js';
import { Supplier, SupplierDoc } from '../../models/Supplier.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeDebitNote } from '../../serializers.js';

// Read-only — a Debit Note is only ever created as a side effect of a
// supplier-direction return (routes/returns/index.ts), never entered
// directly. Its own status can change afterward via [id].ts (confirm/void).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'debit-notes:view');
  if (!session) return;

  const { status } = req.query;
  await connectToDatabase();

  const filter: Record<string, unknown> = { clientId: session.clientId };
  if (typeof status === 'string') filter.status = status;

  const notes = (await DebitNote.find(filter).sort({ createdAt: -1 }).lean()) as DebitNoteDoc[];
  if (notes.length === 0) return res.status(200).json({ debitNotes: [] });

  const returnIds = [...new Set(notes.map((n) => n.returnId.toString()))];
  const supplierIds = [...new Set(notes.map((n) => n.supplierId.toString()))];
  const [returns, suppliers] = await Promise.all([
    Return.find({ _id: { $in: returnIds }, clientId: session.clientId }).select('returnNumber').lean() as Promise<ReturnDoc[]>,
    Supplier.find({ _id: { $in: supplierIds }, clientId: session.clientId }).select('name').lean() as Promise<SupplierDoc[]>,
  ]);
  const returnNumberById = new Map(returns.map((r) => [r._id.toString(), r.returnNumber]));
  const supplierNameById = new Map(suppliers.map((s) => [s._id.toString(), s.name]));

  return res.status(200).json({
    debitNotes: notes.map((n) => serializeDebitNote(n, returnNumberById.get(n.returnId.toString()), supplierNameById.get(n.supplierId.toString()))),
  });
}

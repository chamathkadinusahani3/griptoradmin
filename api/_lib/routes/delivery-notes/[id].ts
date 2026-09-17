import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { DeliveryNote, DeliveryNoteDoc } from '../../models/DeliveryNote.js';
import { SalesOrder, SalesOrderDoc } from '../../models/SalesOrder.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeDeliveryNote } from '../../serializers.js';

interface UpdateDeliveryNoteBody {
  action?: 'pick' | 'pack' | 'cancel';
}

// Sales Module Phase 5 — 'pick'/'pack' are optional pre-dispatch waypoints a
// Pending (DAG-mode) note can move through before confirm.ts finalizes it;
// 'cancel' now works from any of Pending/Picked/Packed, not just Pending,
// since a note can be called off at any point before it's actually
// confirmed. No stock/SalesOrder/Sale side effects to reverse in any case —
// none were ever applied yet (see fulfill.ts's DAG branch).
const PRE_CONFIRM_STATUSES = ['Pending', 'Picked', 'Packed'];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'sales:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing delivery note id' });

  const { action } = (req.body ?? {}) as UpdateDeliveryNoteBody;
  if (action !== 'pick' && action !== 'pack' && action !== 'cancel') {
    return res.status(400).json({ error: 'action must be "pick", "pack", or "cancel"' });
  }

  await connectToDatabase();

  const existing = (await DeliveryNote.findOne({ _id: id, clientId: session.clientId }).lean()) as DeliveryNoteDoc | null;
  if (!existing) return res.status(404).json({ error: 'Delivery note not found' });

  let nextStatus: string;
  if (action === 'pick') {
    if (existing.status !== 'Pending') return res.status(400).json({ error: 'Only a Pending delivery note can be marked Picked' });
    nextStatus = 'Picked';
  } else if (action === 'pack') {
    if (existing.status !== 'Picked') return res.status(400).json({ error: 'Only a Picked delivery note can be marked Packed' });
    nextStatus = 'Packed';
  } else {
    if (!PRE_CONFIRM_STATUSES.includes(existing.status)) {
      return res.status(400).json({ error: 'Only a Pending, Picked, or Packed delivery note can be cancelled' });
    }
    nextStatus = 'Cancelled';
  }

  const note = (await DeliveryNote.findOneAndUpdate(
    { _id: id, clientId: session.clientId, status: existing.status },
    { status: nextStatus },
    { returnDocument: 'after' }
  ).lean()) as DeliveryNoteDoc | null;
  if (!note) return res.status(400).json({ error: 'This delivery note changed status — refresh and try again' });

  const [order, customer] = await Promise.all([
    SalesOrder.findById(note.salesOrderId).select('salesOrderNumber').lean() as Promise<SalesOrderDoc | null>,
    Customer.findById(note.customerId).select('name').lean() as Promise<CustomerDoc | null>,
  ]);

  return res.status(200).json({ deliveryNote: serializeDeliveryNote(note, order?.salesOrderNumber, customer?.name) });
}

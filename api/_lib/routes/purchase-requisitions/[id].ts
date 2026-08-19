import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { PurchaseRequisition, PurchaseRequisitionDoc } from '../../models/PurchaseRequisition.js';
import { User } from '../../models/User.js';
import { requireTenantPermission } from '../../auth.js';
import { serializePurchaseRequisition } from '../../serializers.js';

interface UpdateRequisitionBody {
  action?: 'approve' | 'reject';
  rejectionReason?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing requisition id' });

  const body = (req.body ?? {}) as UpdateRequisitionBody;
  if (body.action !== 'approve' && body.action !== 'reject') {
    return res.status(400).json({ error: 'action must be "approve" or "reject"' });
  }

  // Approving/rejecting someone else's spend request is deliberately a
  // stricter, Manager/Owner-only gate — the same STANDALONE permission the
  // generic Approval model already uses (approvals:respond), not the
  // broader purchase-orders:manage every requester also holds. Otherwise
  // any staff member who can create a requisition could also approve their
  // own, which defeats the point of an approval step.
  const session = await requireTenantPermission(req, res, 'approvals:respond');
  if (!session) return;

  await connectToDatabase();

  const existing = (await PurchaseRequisition.findOne({ _id: id, clientId: session.clientId }).lean()) as PurchaseRequisitionDoc | null;
  if (!existing) return res.status(404).json({ error: 'Purchase requisition not found' });
  if (existing.status !== 'Pending') {
    return res.status(400).json({ error: 'Only a Pending requisition can be approved or rejected' });
  }
  if (body.action === 'reject' && !body.rejectionReason?.trim()) {
    return res.status(400).json({ error: 'A rejection reason is required' });
  }

  const updated = (await PurchaseRequisition.findOneAndUpdate(
    { _id: id, clientId: session.clientId, status: 'Pending' },
    {
      status: body.action === 'approve' ? 'Approved' : 'Rejected',
      reviewedBy: session.sub,
      reviewedAt: new Date(),
      rejectionReason: body.action === 'reject' ? body.rejectionReason!.trim() : undefined,
    },
    { returnDocument: 'after' }
  ).lean()) as PurchaseRequisitionDoc | null;
  if (!updated) return res.status(400).json({ error: 'This requisition changed status — refresh and try again' });

  const users = (await User.find({ _id: { $in: [updated.requestedBy, updated.reviewedBy] } }).select('name').lean()) as { _id: unknown; name: string }[];
  const nameById = new Map(users.map((u) => [(u._id as { toString(): string }).toString(), u.name]));

  return res.status(200).json({
    requisition: serializePurchaseRequisition(updated, nameById.get(updated.requestedBy.toString()), nameById.get(updated.reviewedBy!.toString())),
  });
}

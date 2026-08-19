import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { WarrantyClaim, WarrantyClaimDoc } from '../../models/WarrantyClaim.js';
import { Customer } from '../../models/Customer.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeWarrantyClaim } from '../../serializers.js';

interface UpdateWarrantyClaimBody {
  action?: 'approve' | 'reject' | 'resolve';
  resolution?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'complaints:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing warranty claim id' });

  const body = (req.body ?? {}) as UpdateWarrantyClaimBody;
  if (!body.action || !['approve', 'reject', 'resolve'].includes(body.action)) {
    return res.status(400).json({ error: 'action must be "approve", "reject", or "resolve"' });
  }

  await connectToDatabase();

  const existing = (await WarrantyClaim.findOne({ _id: id, clientId: session.clientId }).lean()) as WarrantyClaimDoc | null;
  if (!existing) return res.status(404).json({ error: 'Warranty claim not found' });

  const update: Record<string, unknown> = { reviewedBy: session.sub };
  if (body.action === 'approve') {
    if (existing.status !== 'Open') return res.status(400).json({ error: 'Only an Open claim can be approved' });
    update.status = 'Approved';
  } else if (body.action === 'reject') {
    if (existing.status !== 'Open') return res.status(400).json({ error: 'Only an Open claim can be rejected' });
    update.status = 'Rejected';
  } else {
    if (existing.status !== 'Approved') return res.status(400).json({ error: 'Only an Approved claim can be resolved' });
    if (!body.resolution?.trim()) return res.status(400).json({ error: 'A resolution is required' });
    update.status = 'Resolved';
    update.resolution = body.resolution.trim();
    update.resolvedAt = new Date();
  }

  const claim = (await WarrantyClaim.findOneAndUpdate(
    { _id: id, clientId: session.clientId },
    update,
    { returnDocument: 'after' }
  ).lean()) as WarrantyClaimDoc;

  const customer = (await Customer.findById(claim.customerId).select('name').lean()) as { name: string } | null;
  return res.status(200).json({ claim: serializeWarrantyClaim(claim, customer?.name) });
}

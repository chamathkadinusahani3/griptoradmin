import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Complaint, ComplaintDoc } from '../../models/Complaint.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { Supplier, SupplierDoc } from '../../models/Supplier.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeComplaint } from '../../serializers.js';

interface UpdateComplaintBody {
  category?: string;
  subject?: string;
  description?: string;
  priority?: 'Low' | 'Medium' | 'High' | 'Urgent';
  status?: 'Open' | 'In Progress' | 'Resolved' | 'Closed';
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
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing complaint id' });

  await connectToDatabase();

  const existing = (await Complaint.findOne({ _id: id, clientId: session.clientId }).lean()) as ComplaintDoc | null;
  if (!existing) return res.status(404).json({ error: 'Complaint not found' });

  const body = (req.body ?? {}) as UpdateComplaintBody;
  const update: Record<string, unknown> = {};
  for (const key of ['category', 'subject', 'description', 'priority', 'status', 'resolution'] as const) {
    if (body[key] !== undefined) update[key] = body[key];
  }

  // Stamped once — re-saving an already-Resolved/Closed complaint (e.g.
  // editing its resolution text) doesn't reset the clock.
  const wasOpenish = existing.status !== 'Resolved' && existing.status !== 'Closed';
  const justResolved = wasOpenish && (body.status === 'Resolved' || body.status === 'Closed');
  if (justResolved) update.resolvedAt = new Date();

  const complaint = (await Complaint.findOneAndUpdate(
    { _id: id, clientId: session.clientId },
    update,
    { returnDocument: 'after' }
  ).lean()) as ComplaintDoc;

  let partyName: string | undefined;
  if (complaint.customerId) {
    const customer = (await Customer.findById(complaint.customerId).lean()) as CustomerDoc | null;
    partyName = customer?.name;
  } else if (complaint.supplierId) {
    const supplier = (await Supplier.findById(complaint.supplierId).lean()) as SupplierDoc | null;
    partyName = supplier?.name;
  }

  return res.status(200).json({ complaint: serializeComplaint(complaint, partyName) });
}

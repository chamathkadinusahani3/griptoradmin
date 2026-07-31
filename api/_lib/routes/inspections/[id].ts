import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Inspection, InspectionDoc } from '../../models/Inspection.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { Technician, TechnicianDoc } from '../../models/Technician.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeInspection } from '../../serializers.js';

interface MediaInput {
  url: string;
  type: 'image' | 'video';
}

interface UpdateInspectionBody {
  vehicle?: string;
  plate?: string;
  result?: 'Pass' | 'Advisory' | 'Fail';
  notes?: string;
  media?: MediaInput[];
  additionalCost?: number;
  // Manual override — e.g. staff records that a customer approved over the phone.
  approvalStatus?: 'not_required' | 'pending' | 'approved' | 'rejected';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'inspections:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing inspection id' });

  await connectToDatabase();

  // Scoped by BOTH _id and clientId — the write-by-id multi-tenancy boundary.
  const existing = (await Inspection.findOne({ _id: id, clientId: session.clientId }).lean()) as InspectionDoc | null;
  if (!existing) return res.status(404).json({ error: 'Inspection not found' });

  const body = (req.body ?? {}) as UpdateInspectionBody;
  const update: Record<string, unknown> = {};
  for (const key of ['vehicle', 'plate', 'result', 'notes', 'media', 'additionalCost', 'approvalStatus'] as const) {
    if (body[key] !== undefined) update[key] = body[key];
  }
  if (body.approvalStatus !== undefined && body.approvalStatus !== 'pending') {
    update.approvalRespondedAt = new Date();
  }

  const inspection = (await Inspection.findOneAndUpdate(
    { _id: id, clientId: session.clientId },
    update,
    { returnDocument: 'after' }
  ).lean()) as InspectionDoc;

  const customer = (await Customer.findById(inspection.customerId).lean()) as CustomerDoc | null;
  const technician = (await Technician.findById(inspection.technicianId).lean()) as TechnicianDoc | null;

  return res.status(200).json({ inspection: serializeInspection(inspection, customer?.name, technician?.name) });
}

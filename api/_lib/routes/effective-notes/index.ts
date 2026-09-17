import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { EffectiveNote, EffectiveNoteDoc } from '../../models/EffectiveNote.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { WarrantyClaim, WarrantyClaimDoc } from '../../models/WarrantyClaim.js';
import { requireTenantPermission } from '../../auth.js';
import { generateSequentialNumber } from '../../numbering.js';
import { serializeEffectiveNote } from '../../serializers.js';

interface CreateEffectiveNoteBody {
  customerId?: string;
  warrantyClaimId?: string;
  claimedAmount?: number;
  approvedAmount?: number;
  reason?: string;
  notes?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function withNames(clientId: string, notes: EffectiveNoteDoc[]) {
  if (notes.length === 0) return [];

  const customerIds = [...new Set(notes.map((n) => n.customerId.toString()))];
  const warrantyClaimIds = [...new Set(notes.map((n) => n.warrantyClaimId?.toString()).filter((id): id is string => !!id))];

  const [customers, claims] = await Promise.all([
    Customer.find({ _id: { $in: customerIds }, clientId }).select('name').lean() as Promise<CustomerDoc[]>,
    warrantyClaimIds.length > 0
      ? (WarrantyClaim.find({ _id: { $in: warrantyClaimIds }, clientId }).select('claimNumber').lean() as Promise<WarrantyClaimDoc[]>)
      : Promise.resolve([]),
  ]);
  const custNameById = new Map(customers.map((c) => [c._id.toString(), c.name]));
  const claimNumberById = new Map(claims.map((c) => [c._id.toString(), c.claimNumber]));

  return notes.map((n) =>
    serializeEffectiveNote(n, {
      customerName: custNameById.get(n.customerId.toString()),
      warrantyClaimNumber: n.warrantyClaimId ? claimNumberById.get(n.warrantyClaimId.toString()) : undefined,
    })
  );
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'effective-notes:view');
  if (!session) return;

  const { status, customerId } = req.query;
  await connectToDatabase();
  const filter: Record<string, unknown> = { clientId: session.clientId };
  if (typeof status === 'string') filter.status = status;
  if (typeof customerId === 'string') filter.customerId = customerId;

  const notes = (await EffectiveNote.find(filter).sort({ createdAt: -1 }).lean()) as EffectiveNoteDoc[];
  return res.status(200).json({ effectiveNotes: await withNames(session.clientId, notes) });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'effective-notes:manage');
  if (!session) return;

  const body = (req.body ?? {}) as CreateEffectiveNoteBody;
  const { customerId, warrantyClaimId, claimedAmount, approvedAmount, reason, notes } = body;

  if (!customerId) return res.status(400).json({ error: 'customerId is required' });
  if (claimedAmount == null || typeof claimedAmount !== 'number' || claimedAmount <= 0) {
    return res.status(400).json({ error: 'claimedAmount must be a positive number' });
  }
  if (approvedAmount == null || typeof approvedAmount !== 'number' || approvedAmount < 0) {
    return res.status(400).json({ error: 'approvedAmount must be a non-negative number' });
  }
  if (approvedAmount >= claimedAmount) {
    return res.status(400).json({ error: 'approvedAmount must be less than claimedAmount — this document only exists to capture an underclaim shortfall' });
  }
  if (!reason?.trim()) return res.status(400).json({ error: 'A reason is required' });

  await connectToDatabase();

  const customer = (await Customer.findOne({ _id: customerId, clientId: session.clientId }).lean()) as CustomerDoc | null;
  if (!customer) return res.status(400).json({ error: 'Customer not found' });

  let claim: WarrantyClaimDoc | null = null;
  if (warrantyClaimId) {
    claim = (await WarrantyClaim.findOne({ _id: warrantyClaimId, clientId: session.clientId }).lean()) as WarrantyClaimDoc | null;
    if (!claim) return res.status(400).json({ error: 'Warranty claim not found' });
    if (claim.customerId.toString() !== customerId) {
      return res.status(400).json({ error: 'This warranty claim belongs to a different customer' });
    }
  }

  const amount = Math.round((claimedAmount - approvedAmount) * 100) / 100;
  const effectiveNoteNumber = await generateSequentialNumber(EffectiveNote, session.clientId, 'effectiveNoteNumber', 'effectiveNote');

  const note = await EffectiveNote.create({
    clientId: session.clientId,
    effectiveNoteNumber,
    customerId,
    warrantyClaimId: warrantyClaimId || undefined,
    claimedAmount,
    approvedAmount,
    amount,
    appliedAmount: 0,
    remainingAmount: amount,
    reason: reason.trim(),
    notes,
  });

  const [serialized] = await withNames(session.clientId, [note.toObject()]);
  return res.status(201).json({ effectiveNote: serialized });
}

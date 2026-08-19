import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { WarrantyClaim, WarrantyClaimDoc } from '../../models/WarrantyClaim.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { JobCard, JobCardDoc } from '../../models/JobCard.js';
import { Part, PartDoc } from '../../models/Part.js';
import { requireTenantPermission } from '../../auth.js';
import { generateSequentialNumber } from '../../numbering.js';
import { serializeWarrantyClaim } from '../../serializers.js';

interface CreateWarrantyClaimBody {
  customerId?: string;
  jobCardId?: string;
  partId?: string;
  issueDescription?: string;
  providedDate?: string;
  warrantyPeriodDays?: number;
  notes?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'complaints:view');
  if (!session) return;

  await connectToDatabase();
  const claims = (await WarrantyClaim.find({ clientId: session.clientId }).sort({ createdAt: -1 }).lean()) as WarrantyClaimDoc[];
  const customerIds = [...new Set(claims.map((c) => c.customerId.toString()))];
  const customers = (await Customer.find({ _id: { $in: customerIds } }).select('name').lean()) as CustomerDoc[];
  const nameById = new Map(customers.map((c) => [c._id.toString(), c.name]));

  return res.status(200).json({
    claims: claims.map((c) => serializeWarrantyClaim(c, nameById.get(c.customerId.toString()))),
  });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'complaints:manage');
  if (!session) return;

  const { customerId, jobCardId, partId, issueDescription, providedDate, warrantyPeriodDays, notes } = (req.body ?? {}) as CreateWarrantyClaimBody;
  if (!customerId || !issueDescription?.trim()) {
    return res.status(400).json({ error: 'customerId and issueDescription are required' });
  }

  await connectToDatabase();

  const customer = (await Customer.findOne({ _id: customerId, clientId: session.clientId }).lean()) as CustomerDoc | null;
  if (!customer) return res.status(400).json({ error: 'Unknown customer' });

  if (jobCardId) {
    const jobCard = (await JobCard.findOne({ _id: jobCardId, clientId: session.clientId }).lean()) as JobCardDoc | null;
    if (!jobCard) return res.status(400).json({ error: 'Unknown job card' });
  }
  let partName: string | undefined;
  if (partId) {
    const part = (await Part.findOne({ _id: partId, clientId: session.clientId }).lean()) as PartDoc | null;
    if (!part) return res.status(400).json({ error: 'Unknown part' });
    partName = part.name;
  }

  const claimNumber = await generateSequentialNumber(WarrantyClaim, session.clientId, 'claimNumber', 'warrantyClaim');

  const claim = await WarrantyClaim.create({
    clientId: session.clientId,
    claimNumber,
    customerId,
    jobCardId: jobCardId || undefined,
    partId: partId || undefined,
    partName,
    issueDescription: issueDescription.trim(),
    providedDate: providedDate ? new Date(providedDate) : undefined,
    warrantyPeriodDays,
    notes,
  });

  return res.status(201).json({ claim: serializeWarrantyClaim(claim.toObject(), customer.name) });
}

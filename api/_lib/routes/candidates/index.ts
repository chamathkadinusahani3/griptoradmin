import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Candidate, CandidateDoc, CANDIDATE_STATUSES } from '../../models/Candidate.js';
import { JobOpening } from '../../models/JobOpening.js';
import { requireTenant, requireTenantPermission } from '../../auth.js';
import { serializeCandidate } from '../../serializers.js';

interface CreateCandidateBody {
  openingId?: string;
  name?: string;
  email?: string;
  phone?: string;
  notes?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'recruitment:view');
  if (!session) return;

  await connectToDatabase();
  const { openingId } = req.query;
  const filter: Record<string, unknown> = { clientId: session.clientId };
  if (typeof openingId === 'string') filter.openingId = openingId;

  const candidates = (await Candidate.find(filter).sort({ createdAt: -1 }).lean()) as CandidateDoc[];
  return res.status(200).json({ candidates: candidates.map(serializeCandidate) });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'recruitment:manage');
  if (!session) return;

  const { openingId, name, email, phone, notes } = (req.body ?? {}) as CreateCandidateBody;
  if (!openingId || !name || !name.trim()) {
    return res.status(400).json({ error: 'openingId and name are required' });
  }

  await connectToDatabase();

  const opening = await JobOpening.findOne({ _id: openingId, clientId: session.clientId }).lean();
  if (!opening) return res.status(404).json({ error: 'Job opening not found' });

  const candidate = await Candidate.create({
    clientId: session.clientId,
    openingId,
    name: name.trim(),
    email,
    phone,
    notes,
    status: CANDIDATE_STATUSES[0],
  });

  return res.status(201).json({ candidate: serializeCandidate(candidate.toObject()) });
}

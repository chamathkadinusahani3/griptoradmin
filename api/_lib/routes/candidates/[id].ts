import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Candidate, CandidateDoc, CANDIDATE_STATUSES } from '../../models/Candidate.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeCandidate } from '../../serializers.js';

interface UpdateCandidateBody {
  status?: (typeof CANDIDATE_STATUSES)[number];
  notes?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'recruitment:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing candidate id' });

  const { status, notes } = (req.body ?? {}) as UpdateCandidateBody;
  if (status !== undefined && !(CANDIDATE_STATUSES as readonly string[]).includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${CANDIDATE_STATUSES.join(', ')}` });
  }

  await connectToDatabase();

  const update: Record<string, unknown> = {};
  if (status !== undefined) update.status = status;
  if (notes !== undefined) update.notes = notes;

  const candidate = (await Candidate.findOneAndUpdate({ _id: id, clientId: session.clientId }, update, {
    returnDocument: 'after',
  }).lean()) as CandidateDoc | null;
  if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

  return res.status(200).json({ candidate: serializeCandidate(candidate) });
}

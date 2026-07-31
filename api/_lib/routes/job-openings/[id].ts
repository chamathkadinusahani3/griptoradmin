import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { JobOpening, JobOpeningDoc } from '../../models/JobOpening.js';
import { Candidate } from '../../models/Candidate.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeJobOpening } from '../../serializers.js';

interface UpdateOpeningBody {
  title?: string;
  description?: string;
  status?: 'Open' | 'Closed';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'recruitment:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing job opening id' });

  const { title, description, status } = (req.body ?? {}) as UpdateOpeningBody;
  if (status !== undefined && status !== 'Open' && status !== 'Closed') {
    return res.status(400).json({ error: 'status must be Open or Closed' });
  }
  if (title !== undefined && !title.trim()) {
    return res.status(400).json({ error: 'title cannot be empty' });
  }

  await connectToDatabase();

  const update: Record<string, unknown> = {};
  if (title !== undefined) update.title = title.trim();
  if (description !== undefined) update.description = description;
  if (status !== undefined) update.status = status;

  const opening = (await JobOpening.findOneAndUpdate({ _id: id, clientId: session.clientId }, update, {
    returnDocument: 'after',
  }).lean()) as JobOpeningDoc | null;
  if (!opening) return res.status(404).json({ error: 'Job opening not found' });

  const candidateCount = await Candidate.countDocuments({ openingId: id });
  return res.status(200).json({ jobOpening: serializeJobOpening(opening, candidateCount) });
}

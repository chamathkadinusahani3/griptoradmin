import type { VercelRequest, VercelResponse } from '@vercel/node';
import mongoose from 'mongoose';
import { connectToDatabase } from '../../db.js';
import { JobOpening, JobOpeningDoc } from '../../models/JobOpening.js';
import { Candidate } from '../../models/Candidate.js';
import { requireTenant, requireTenantPermission } from '../../auth.js';
import { serializeJobOpening } from '../../serializers.js';

interface CreateOpeningBody {
  title?: string;
  description?: string;
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
  const openings = (await JobOpening.find({ clientId: session.clientId }).sort({ createdAt: -1 }).lean()) as JobOpeningDoc[];
  // Unlike .find(), an aggregation $match is NOT schema-aware — Mongoose
  // never auto-casts session.clientId (a plain string from the JWT) to the
  // real ObjectId the field is stored as, so a bare string here silently
  // matches nothing. Cast explicitly.
  const counts = await Candidate.aggregate([
    { $match: { clientId: new mongoose.Types.ObjectId(session.clientId) } },
    { $group: { _id: '$openingId', count: { $sum: 1 } } },
  ]);
  const countByOpening = new Map(counts.map((c) => [c._id.toString(), c.count as number]));

  return res.status(200).json({
    jobOpenings: openings.map((o) => serializeJobOpening(o, countByOpening.get(o._id.toString()) ?? 0)),
  });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'recruitment:manage');
  if (!session) return;

  const { title, description } = (req.body ?? {}) as CreateOpeningBody;
  if (!title || !title.trim()) return res.status(400).json({ error: 'title is required' });

  await connectToDatabase();
  const opening = await JobOpening.create({ clientId: session.clientId, title: title.trim(), description, status: 'Open' });

  return res.status(201).json({ jobOpening: serializeJobOpening(opening.toObject()) });
}

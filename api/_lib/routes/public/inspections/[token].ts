import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../../db.js';
import { Inspection, InspectionDoc } from '../../../models/Inspection.js';
import { serializePublicInspection } from '../../../serializers.js';

// Public, unauthenticated — same origin as the rest of griptoradmin (the
// approval page lives at /approve/:token within this app, not on a
// different domain), so no CORS handling is needed here. The only
// "credential" is the token itself: a real random secret (see
// api/inspections/index.ts), never the document's Mongo _id.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'PATCH') return handlePatch(req, res);
  res.setHeader('Allow', 'GET, PATCH');
  return res.status(405).json({ error: 'Method not allowed' });
}

function getToken(req: VercelRequest): string | null {
  const { token } = req.query;
  return typeof token === 'string' ? token : null;
}

async function handleGet(req: VercelRequest, res: VercelResponse) {
  const token = getToken(req);
  if (!token) return res.status(400).json({ error: 'Missing token' });

  await connectToDatabase();
  const inspection = (await Inspection.findOne({ approvalToken: token }).lean()) as InspectionDoc | null;
  if (!inspection) return res.status(404).json({ error: 'Not found' });

  return res.status(200).json({ inspection: serializePublicInspection(inspection) });
}

interface DecisionBody {
  decision?: 'approved' | 'rejected';
}

async function handlePatch(req: VercelRequest, res: VercelResponse) {
  const token = getToken(req);
  if (!token) return res.status(400).json({ error: 'Missing token' });

  const { decision } = (req.body ?? {}) as DecisionBody;
  if (decision !== 'approved' && decision !== 'rejected') {
    return res.status(400).json({ error: 'decision must be "approved" or "rejected"' });
  }

  await connectToDatabase();
  const existing = (await Inspection.findOne({ approvalToken: token }).lean()) as InspectionDoc | null;
  if (!existing) return res.status(404).json({ error: 'Not found' });

  // Single-use: once a decision is recorded, the link can't be replayed to
  // flip it again.
  if (existing.approvalStatus !== 'pending') {
    return res.status(400).json({ error: 'This inspection has already been responded to' });
  }

  const inspection = (await Inspection.findOneAndUpdate(
    { approvalToken: token, approvalStatus: 'pending' },
    { approvalStatus: decision, approvalRespondedAt: new Date() },
    { returnDocument: 'after' }
  ).lean()) as InspectionDoc | null;

  if (!inspection) return res.status(400).json({ error: 'This inspection has already been responded to' });

  return res.status(200).json({ inspection: serializePublicInspection(inspection) });
}

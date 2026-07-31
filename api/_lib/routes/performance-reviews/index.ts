import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { PerformanceReview, PerformanceReviewDoc } from '../../models/PerformanceReview.js';
import { User, UserDoc } from '../../models/User.js';
import { requireTenant, requireTenantPermission } from '../../auth.js';
import { serializePerformanceReview } from '../../serializers.js';

interface CreateReviewBody {
  employeeUserId?: string;
  reviewDate?: string;
  rating?: number;
  feedback?: string;
}

// Append-only — a submitted review is a real record, not something to
// silently rewrite later (same reasoning as Approvals being immutable once
// responded to). No PATCH/DELETE in v1.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

// requireTenant, not requireTenantPermission — an employee can see their own
// review history, not just managers.
async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'performance-reviews:view');
  if (!session) return;

  await connectToDatabase();
  const { userId } = req.query;
  const filter: Record<string, unknown> = { clientId: session.clientId };
  if (typeof userId === 'string') filter.employeeUserId = userId;

  const reviews = (await PerformanceReview.find(filter).sort({ reviewDate: -1 }).lean()) as PerformanceReviewDoc[];
  const userIds = [...new Set(reviews.flatMap((r) => [r.employeeUserId.toString(), r.reviewedBy.toString()]))];
  const users = (await User.find({ _id: { $in: userIds } }).lean()) as UserDoc[];
  const userNameById = new Map(users.map((u) => [u._id.toString(), u.name]));

  return res.status(200).json({
    performanceReviews: reviews.map((r) =>
      serializePerformanceReview(r, userNameById.get(r.employeeUserId.toString()), userNameById.get(r.reviewedBy.toString()))
    ),
  });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'performance-reviews:create');
  if (!session) return;

  const { employeeUserId, reviewDate, rating, feedback } = (req.body ?? {}) as CreateReviewBody;
  if (!employeeUserId || !reviewDate || rating == null || !feedback || !feedback.trim()) {
    return res.status(400).json({ error: 'employeeUserId, reviewDate, rating, and feedback are required' });
  }
  if (typeof rating !== 'number' || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'rating must be a number from 1 to 5' });
  }

  await connectToDatabase();

  const employee = await User.findOne({ _id: employeeUserId, clientId: session.clientId, role: 'tenant' }).lean();
  if (!employee) return res.status(404).json({ error: 'Staff member not found' });

  const review = await PerformanceReview.create({
    clientId: session.clientId,
    employeeUserId,
    reviewedBy: session.sub,
    reviewDate: new Date(reviewDate),
    rating,
    feedback: feedback.trim(),
  });

  const reviewer = (await User.findById(session.sub).lean()) as UserDoc | null;
  return res.status(201).json({
    performanceReview: serializePerformanceReview(review.toObject(), (employee as UserDoc).name, reviewer?.name),
  });
}

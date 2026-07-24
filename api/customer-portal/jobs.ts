import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../_lib/db';
import { JobCard, JobCardDoc } from '../_lib/models/JobCard';
import { Technician, TechnicianDoc } from '../_lib/models/Technician';
import { requireCustomer } from '../_lib/auth';
import { serializeJobCard } from '../_lib/serializers';

// Read-only service history — double-scoped by BOTH clientId and
// customerId, the new per-customer boundary this phase introduces (until
// now, "who can see a Customer's job cards" only ever meant "any staff
// member of that tenant").
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = requireCustomer(req, res);
  if (!session) return;

  await connectToDatabase();
  const jobs = (await JobCard.find({ clientId: session.clientId, customerId: session.customerId })
    .sort({ createdAt: -1 })
    .lean()) as JobCardDoc[];
  const technicians = (await Technician.find({ clientId: session.clientId }).lean()) as TechnicianDoc[];
  const technicianNameById = new Map(technicians.map((t) => [t._id.toString(), t.name]));

  return res.status(200).json({
    jobCards: jobs.map((j) => serializeJobCard(j, undefined, technicianNameById.get(j.technicianId.toString()))),
  });
}

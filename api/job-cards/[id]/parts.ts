import type { VercelRequest, VercelResponse } from '@vercel/node';
import mongoose from 'mongoose';
import { connectToDatabase } from '../../_lib/db';
import { JobCard, JobCardDoc } from '../../_lib/models/JobCard';
import { Part, PartDoc } from '../../_lib/models/Part';
import { Customer, CustomerDoc } from '../../_lib/models/Customer';
import { Technician, TechnicianDoc } from '../../_lib/models/Technician';
import { Bay, BayDoc } from '../../_lib/models/Bay';
import { requireTenant } from '../../_lib/auth';
import { serializeJobCard } from '../../_lib/serializers';

interface AddPartBody {
  partId?: string;
  qty?: number;
}

// Real parts consumption, atomically decrementing real inventory — the
// core value-loop fix this feature was missing entirely. Same
// "count/check inside the transaction" discipline as api/sales/index.ts's
// checkout (never trust a pre-check done outside the transaction).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = requireTenant(req, res);
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing job card id' });

  const { partId, qty } = (req.body ?? {}) as AddPartBody;
  if (!partId || !qty || qty <= 0) {
    return res.status(400).json({ error: 'partId and a positive qty are required' });
  }

  await connectToDatabase();

  const existing = (await JobCard.findOne({ _id: id, clientId: session.clientId }).lean()) as JobCardDoc | null;
  if (!existing) return res.status(404).json({ error: 'Job card not found' });
  if (existing.status === 'Completed') {
    return res.status(400).json({ error: 'This job is completed — its parts list is locked' });
  }

  const dbSession = await mongoose.startSession();
  try {
    let updated: JobCardDoc | undefined;
    await dbSession.withTransaction(async () => {
      // Scoped to the job's own branch when it has one — a part from a
      // different branch's inventory can't be pulled onto this job, the
      // same real per-branch stock boundary established for POS.
      const partFilter: Record<string, unknown> = { _id: partId, clientId: session.clientId };
      if (existing.branchId) partFilter.branchId = existing.branchId;
      const part = (await Part.findOne(partFilter).session(dbSession)) as (PartDoc & mongoose.Document) | null;
      if (!part) {
        throw Object.assign(new Error('Unknown part for this job’s branch'), { statusCode: 400 });
      }
      if (part.stock < qty) {
        throw Object.assign(new Error(`Not enough stock for "${part.name}" (have ${part.stock}, requested ${qty})`), { statusCode: 400 });
      }

      await Part.updateOne({ _id: part._id }, { $inc: { stock: -qty } }, { session: dbSession });

      const job = await JobCard.findOneAndUpdate(
        { _id: id, clientId: session.clientId, status: { $ne: 'Completed' } },
        { $push: { partsUsed: { partId: part._id, name: part.name, price: part.price, qty } } },
        { session: dbSession, returnDocument: 'after' }
      );
      if (!job) {
        // The job was completed by a concurrent request between our read
        // above and this write — abort the whole transaction, including
        // the stock decrement just made.
        throw Object.assign(new Error('This job is completed — its parts list is locked'), { statusCode: 400 });
      }
      updated = job.toObject() as JobCardDoc;
    });

    const customer = (await Customer.findById(updated!.customerId).lean()) as CustomerDoc | null;
    const technician = (await Technician.findById(updated!.technicianId).lean()) as TechnicianDoc | null;
    const bay = updated!.bayId ? ((await Bay.findById(updated!.bayId).lean()) as BayDoc | null) : null;

    return res.status(200).json({ jobCard: serializeJobCard(updated!, customer?.name, technician?.name, bay?.name) });
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
    const message = err instanceof Error ? err.message : 'Failed to add part';
    return res.status(statusCode).json({ error: message });
  } finally {
    await dbSession.endSession();
  }
}

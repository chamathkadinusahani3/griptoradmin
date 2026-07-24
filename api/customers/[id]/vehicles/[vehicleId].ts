import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../../_lib/db';
import { Customer } from '../../../_lib/models/Customer';
import { Vehicle } from '../../../_lib/models/Vehicle';
import { requireTenant } from '../../../_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'DELETE') {
    res.setHeader('Allow', 'DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = requireTenant(req, res);
  if (!session) return;

  const { id, vehicleId } = req.query;
  if (typeof id !== 'string' || typeof vehicleId !== 'string') {
    return res.status(400).json({ error: 'Missing customer or vehicle id' });
  }

  await connectToDatabase();

  const customer = await Customer.findOne({ _id: id, clientId: session.clientId }).lean();
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const deleted = await Vehicle.findOneAndDelete({ _id: vehicleId, clientId: session.clientId, customerId: id }).lean();
  if (!deleted) return res.status(404).json({ error: 'Vehicle not found' });

  return res.status(204).end();
}

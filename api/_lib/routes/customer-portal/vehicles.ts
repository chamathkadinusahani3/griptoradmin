import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Vehicle, VehicleDoc } from '../../models/Vehicle.js';
import { requireCustomer } from '../../auth.js';
import { serializeVehicle } from '../../serializers.js';

// Read-only for v1 (see Phase 7 "not in scope") — reuses the real Vehicle
// model from Phase 6 directly, no separate portal-side vehicle storage.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = requireCustomer(req, res);
  if (!session) return;

  await connectToDatabase();
  const vehicles = (await Vehicle.find({ clientId: session.clientId, customerId: session.customerId })
    .sort({ createdAt: -1 })
    .lean()) as VehicleDoc[];

  return res.status(200).json({ vehicles: vehicles.map(serializeVehicle) });
}

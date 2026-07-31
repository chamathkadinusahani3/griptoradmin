import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../../../db.js';
import { Customer } from '../../../../models/Customer.js';
import { Vehicle, VehicleDoc } from '../../../../models/Vehicle.js';
import { requireTenantPermission } from '../../../../auth.js';
import { serializeVehicle } from '../../../../serializers.js';

interface CreateVehicleBody {
  label?: string;
  plate?: string;
  make?: string;
  model?: string;
  year?: number;
  notes?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function requireOwnedCustomer(req: VercelRequest, res: VercelResponse, clientId: string) {
  const { id } = req.query;
  if (typeof id !== 'string') {
    res.status(400).json({ error: 'Missing customer id' });
    return null;
  }
  const customer = await Customer.findOne({ _id: id, clientId }).lean();
  if (!customer) {
    res.status(404).json({ error: 'Customer not found' });
    return null;
  }
  return id;
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'customers:view');
  if (!session) return;

  await connectToDatabase();
  const customerId = await requireOwnedCustomer(req, res, session.clientId);
  if (!customerId) return;

  const vehicles = (await Vehicle.find({ clientId: session.clientId, customerId }).sort({ createdAt: -1 }).lean()) as VehicleDoc[];
  return res.status(200).json({ vehicles: vehicles.map(serializeVehicle) });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'customers:manage');
  if (!session) return;

  await connectToDatabase();
  const customerId = await requireOwnedCustomer(req, res, session.clientId);
  if (!customerId) return;

  const { label, plate, make, model, year, notes } = (req.body ?? {}) as CreateVehicleBody;
  if (!label) return res.status(400).json({ error: 'label is required' });

  const vehicle = await Vehicle.create({
    clientId: session.clientId,
    customerId,
    label,
    plate,
    make,
    model,
    year: year ? Number(year) : undefined,
    notes,
  });

  return res.status(201).json({ vehicle: serializeVehicle(vehicle.toObject()) });
}

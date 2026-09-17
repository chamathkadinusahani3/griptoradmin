import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { FleetVehicle, FleetVehicleDoc } from '../../models/FleetVehicle.js';
import { Employee, EmployeeDoc } from '../../models/Employee.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeFleetVehicle } from '../../serializers.js';

interface UpdateVehicleBody {
  vehicleNumber?: string;
  vehicleType?: string;
  capacity?: number;
  capacityUnit?: string;
  driverId?: string | null;
  status?: 'Active' | 'Inactive' | 'In Maintenance';
  fuelEfficiency?: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'PATCH') return handleUpdate(req, res);
  if (req.method === 'DELETE') return handleDelete(req, res);
  res.setHeader('Allow', 'PATCH, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleUpdate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'sf-vehicles:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing vehicle id' });

  const body = (req.body ?? {}) as UpdateVehicleBody;
  if (body.vehicleNumber !== undefined && !body.vehicleNumber.trim()) return res.status(400).json({ error: 'vehicleNumber cannot be empty' });
  if (body.vehicleType !== undefined && !body.vehicleType.trim()) return res.status(400).json({ error: 'vehicleType cannot be empty' });
  if (body.capacity !== undefined && (typeof body.capacity !== 'number' || body.capacity < 0)) {
    return res.status(400).json({ error: 'capacity must be a non-negative number' });
  }
  if (body.status !== undefined && !['Active', 'Inactive', 'In Maintenance'].includes(body.status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  if (body.fuelEfficiency !== undefined && (typeof body.fuelEfficiency !== 'number' || body.fuelEfficiency < 0)) {
    return res.status(400).json({ error: 'fuelEfficiency must be a non-negative number' });
  }

  await connectToDatabase();

  if (body.vehicleNumber !== undefined) {
    const duplicate = await FleetVehicle.findOne({ clientId: session.clientId, vehicleNumber: body.vehicleNumber.trim(), _id: { $ne: id } }).lean();
    if (duplicate) return res.status(400).json({ error: 'A vehicle with this number already exists' });
  }
  if (body.driverId) {
    const driver = await Employee.findOne({ _id: body.driverId, clientId: session.clientId }).lean();
    if (!driver) return res.status(400).json({ error: 'Driver not found' });
  }

  const update: Record<string, unknown> = {};
  if (body.vehicleNumber !== undefined) update.vehicleNumber = body.vehicleNumber.trim();
  if (body.vehicleType !== undefined) update.vehicleType = body.vehicleType.trim();
  if (body.capacity !== undefined) update.capacity = body.capacity;
  if (body.capacityUnit !== undefined) update.capacityUnit = body.capacityUnit;
  if (body.driverId !== undefined) update.driverId = body.driverId || undefined;
  if (body.status !== undefined) update.status = body.status;
  if (body.fuelEfficiency !== undefined) update.fuelEfficiency = body.fuelEfficiency;

  const vehicle = (await FleetVehicle.findOneAndUpdate(
    { _id: id, clientId: session.clientId },
    update,
    { returnDocument: 'after' }
  ).lean()) as FleetVehicleDoc | null;
  if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });

  let driverName: string | undefined;
  if (vehicle.driverId) {
    const driver = (await Employee.findOne({ _id: vehicle.driverId, clientId: session.clientId })
      .populate('userId', 'name')
      .lean()) as (EmployeeDoc & { userId: { name?: string } | null }) | null;
    driverName = driver?.userId?.name;
  }

  return res.status(200).json({ vehicle: serializeFleetVehicle(vehicle, driverName) });
}

async function handleDelete(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'sf-vehicles:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing vehicle id' });

  await connectToDatabase();
  const deleted = await FleetVehicle.findOneAndDelete({ _id: id, clientId: session.clientId }).lean();
  if (!deleted) return res.status(404).json({ error: 'Vehicle not found' });

  return res.status(204).end();
}

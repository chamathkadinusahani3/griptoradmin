import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { FleetVehicle, FleetVehicleDoc } from '../../models/FleetVehicle.js';
import { Employee, EmployeeDoc } from '../../models/Employee.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeFleetVehicle } from '../../serializers.js';

interface CreateVehicleBody {
  vehicleNumber?: string;
  vehicleType?: string;
  capacity?: number;
  capacityUnit?: string;
  driverId?: string;
  fuelEfficiency?: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function withDriverNames(clientId: string, vehicles: FleetVehicleDoc[]) {
  if (vehicles.length === 0) return [];
  const driverIds = [...new Set(vehicles.map((v) => v.driverId?.toString()).filter((id): id is string => !!id))];
  const drivers = (await Employee.find({ _id: { $in: driverIds }, clientId })
    .populate('userId', 'name')
    .lean()) as (EmployeeDoc & { userId: { name?: string } | null })[];
  const nameById = new Map(drivers.map((d) => [d._id.toString(), d.userId?.name]));
  return vehicles.map((v) => serializeFleetVehicle(v, v.driverId ? nameById.get(v.driverId.toString()) : undefined));
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'sf-vehicles:view');
  if (!session) return;

  await connectToDatabase();
  const vehicles = (await FleetVehicle.find({ clientId: session.clientId }).sort({ vehicleNumber: 1 }).lean()) as FleetVehicleDoc[];
  return res.status(200).json({ vehicles: await withDriverNames(session.clientId, vehicles) });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'sf-vehicles:manage');
  if (!session) return;

  const body = (req.body ?? {}) as CreateVehicleBody;
  if (!body.vehicleNumber || !body.vehicleNumber.trim() || !body.vehicleType || !body.vehicleType.trim()) {
    return res.status(400).json({ error: 'vehicleNumber and vehicleType are required' });
  }
  if (body.capacity !== undefined && (typeof body.capacity !== 'number' || body.capacity < 0)) {
    return res.status(400).json({ error: 'capacity must be a non-negative number' });
  }
  if (body.fuelEfficiency !== undefined && (typeof body.fuelEfficiency !== 'number' || body.fuelEfficiency < 0)) {
    return res.status(400).json({ error: 'fuelEfficiency must be a non-negative number' });
  }

  await connectToDatabase();

  const existing = await FleetVehicle.findOne({ clientId: session.clientId, vehicleNumber: body.vehicleNumber.trim() }).lean();
  if (existing) return res.status(400).json({ error: 'A vehicle with this number already exists' });

  if (body.driverId) {
    const driver = await Employee.findOne({ _id: body.driverId, clientId: session.clientId }).lean();
    if (!driver) return res.status(400).json({ error: 'Driver not found' });
  }

  const vehicle = await FleetVehicle.create({
    clientId: session.clientId,
    vehicleNumber: body.vehicleNumber.trim(),
    vehicleType: body.vehicleType.trim(),
    capacity: body.capacity,
    capacityUnit: body.capacityUnit || 'cubic ft',
    driverId: body.driverId || undefined,
    fuelEfficiency: body.fuelEfficiency ?? 0,
  });

  const [serialized] = await withDriverNames(session.clientId, [vehicle.toObject()]);
  return res.status(201).json({ vehicle: serialized });
}

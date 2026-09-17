import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { SalesOrder } from '../../models/SalesOrder.js';
import { DeliveryAssignment, DeliveryAssignmentDoc, DELIVERY_ASSIGNMENT_STATUSES } from '../../models/DeliveryAssignment.js';
import { RouteModel, RouteDoc } from '../../models/Route.js';
import { FleetVehicle, FleetVehicleDoc } from '../../models/FleetVehicle.js';
import { Employee, EmployeeDoc } from '../../models/Employee.js';
import { requireTenantPermission } from '../../auth.js';

interface UpdateAssignmentBody {
  routeId?: string | null;
  driverId?: string | null;
  vehicleId?: string | null;
  status?: (typeof DELIVERY_ASSIGNMENT_STATUSES)[number];
  deliveryDate?: string | null;
  notes?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'sf-deliveries:manage');
  if (!session) return;

  const { salesOrderId } = req.query;
  if (typeof salesOrderId !== 'string') return res.status(400).json({ error: 'Missing salesOrderId' });

  const body = (req.body ?? {}) as UpdateAssignmentBody;
  if (body.status !== undefined && !DELIVERY_ASSIGNMENT_STATUSES.includes(body.status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  await connectToDatabase();

  const order = await SalesOrder.findOne({ _id: salesOrderId, clientId: session.clientId }).lean();
  if (!order) return res.status(404).json({ error: 'Sales order not found' });

  if (body.routeId) {
    const route = await RouteModel.findOne({ _id: body.routeId, clientId: session.clientId }).lean();
    if (!route) return res.status(400).json({ error: 'Route not found' });
  }
  if (body.driverId) {
    const driver = await Employee.findOne({ _id: body.driverId, clientId: session.clientId }).lean();
    if (!driver) return res.status(400).json({ error: 'Driver not found' });
  }
  if (body.vehicleId) {
    const vehicle = await FleetVehicle.findOne({ _id: body.vehicleId, clientId: session.clientId }).lean();
    if (!vehicle) return res.status(400).json({ error: 'Vehicle not found' });
  }

  const update: Record<string, unknown> = { clientId: session.clientId, salesOrderId };
  if (body.routeId !== undefined) update.routeId = body.routeId || undefined;
  if (body.driverId !== undefined) update.driverId = body.driverId || undefined;
  if (body.vehicleId !== undefined) update.vehicleId = body.vehicleId || undefined;
  if (body.status !== undefined) update.status = body.status;
  if (body.deliveryDate !== undefined) update.deliveryDate = body.deliveryDate ? new Date(body.deliveryDate) : undefined;
  if (body.notes !== undefined) update.notes = body.notes;

  // A field can't appear in both $set and $setOnInsert at once (Mongo
  // rejects that as a path conflict) — only default `status` on insert when
  // the caller didn't already provide one via $set.
  const setOnInsert: Record<string, unknown> = {};
  if (body.status === undefined) setOnInsert.status = 'Assigned';

  // Upsert — a pending delivery has no DeliveryAssignment until the first
  // time someone assigns it, at which point one is created and reused for
  // every later update (route change, status progression, etc.).
  const assignment = (await DeliveryAssignment.findOneAndUpdate(
    { salesOrderId, clientId: session.clientId },
    Object.keys(setOnInsert).length > 0 ? { $set: update, $setOnInsert: setOnInsert } : { $set: update },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  ).lean()) as DeliveryAssignmentDoc;

  const [route, driver, vehicle] = await Promise.all([
    assignment.routeId ? (RouteModel.findOne({ _id: assignment.routeId, clientId: session.clientId }).lean() as Promise<RouteDoc | null>) : null,
    assignment.driverId
      ? (Employee.findOne({ _id: assignment.driverId, clientId: session.clientId }).populate('userId', 'name').lean() as Promise<(EmployeeDoc & { userId: { name?: string } | null }) | null>)
      : null,
    assignment.vehicleId ? (FleetVehicle.findOne({ _id: assignment.vehicleId, clientId: session.clientId }).lean() as Promise<FleetVehicleDoc | null>) : null,
  ]);

  return res.status(200).json({
    assignment: {
      id: assignment._id.toString(),
      routeId: assignment.routeId?.toString(),
      routeName: route?.name,
      driverId: assignment.driverId?.toString(),
      driverName: driver?.userId?.name,
      vehicleId: assignment.vehicleId?.toString(),
      vehicleNumber: vehicle?.vehicleNumber,
      status: assignment.status,
      deliveryDate: assignment.deliveryDate,
      notes: assignment.notes,
    },
  });
}

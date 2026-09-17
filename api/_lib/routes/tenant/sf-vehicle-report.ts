import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { FleetVehicle, FleetVehicleDoc } from '../../models/FleetVehicle.js';
import { Employee, EmployeeDoc } from '../../models/Employee.js';
import { DeliveryAssignment, DeliveryAssignmentDoc } from '../../models/DeliveryAssignment.js';
import { requireTenantPermission } from '../../auth.js';
import { resolveReportRange } from '../../reportRange.js';

// Range-filtered by DeliveryAssignment.updatedAt — "how much did this
// vehicle handle in this period," not a lifetime total.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'reports:view');
  if (!session) return;

  const { from, to } = resolveReportRange(req);
  await connectToDatabase();
  const clientId = session.clientId;

  const vehicles = (await FleetVehicle.find({ clientId }).sort({ vehicleNumber: 1 }).lean()) as FleetVehicleDoc[];
  const vehicleIds = vehicles.map((v) => v._id.toString());
  const driverIds = [...new Set(vehicles.map((v) => v.driverId?.toString()).filter((id): id is string => !!id))];

  const [drivers, assignments] = await Promise.all([
    driverIds.length > 0
      ? (Employee.find({ _id: { $in: driverIds }, clientId }).populate('userId', 'name').lean() as Promise<(EmployeeDoc & { userId: { name?: string } | null })[]>)
      : Promise.resolve([]),
    DeliveryAssignment.find({ clientId, vehicleId: { $in: vehicleIds }, updatedAt: { $gte: from, $lte: to } }).lean() as Promise<DeliveryAssignmentDoc[]>,
  ]);
  const driverNameById = new Map(drivers.map((d) => [d._id.toString(), d.userId?.name]));

  const rows = vehicles.map((v) => {
    const id = v._id.toString();
    const vehicleAssignments = assignments.filter((a) => a.vehicleId?.toString() === id);
    return {
      vehicleId: id,
      vehicleNumber: v.vehicleNumber,
      vehicleType: v.vehicleType,
      driverName: v.driverId ? driverNameById.get(v.driverId.toString()) : undefined,
      status: v.status,
      fuelEfficiency: v.fuelEfficiency ?? 0,
      deliveriesAssigned: vehicleAssignments.length,
      deliveriesCompleted: vehicleAssignments.filter((a) => a.status === 'Delivered').length,
    };
  });

  const totalAssigned = rows.reduce((sum, r) => sum + r.deliveriesAssigned, 0);

  return res.status(200).json({
    range: { from, to },
    summary: {
      totalVehicles: rows.length,
      activeVehicles: rows.filter((r) => r.status === 'Active').length,
      avgDeliveriesPerVehicle: rows.length > 0 ? Math.round((totalAssigned / rows.length) * 100) / 100 : 0,
    },
    rows,
  });
}

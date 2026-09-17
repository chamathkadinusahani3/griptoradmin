import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { RouteModel, RouteDoc } from '../../models/Route.js';
import { Salesperson, SalespersonDoc } from '../../models/Salesperson.js';
import { Employee, EmployeeDoc } from '../../models/Employee.js';
import { DeliveryAssignment, DeliveryAssignmentDoc } from '../../models/DeliveryAssignment.js';
import { requireTenantPermission } from '../../auth.js';
import { computePendingDeliveries } from '../../pendingDeliveries.js';

// Point-in-time snapshot — routes are static master data, not something
// that accumulates over a date range. "Active deliveries" counts every
// DeliveryAssignment on the route regardless of status; "pending volume"
// narrows to the still-outstanding subset via computePendingDeliveries(),
// same distinction sf-pending-delivery-report.ts draws.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'reports:view');
  if (!session) return;

  await connectToDatabase();
  const clientId = session.clientId;

  const routes = (await RouteModel.find({ clientId }).sort({ code: 1 }).lean()) as RouteDoc[];
  const salespersonIds = [...new Set(routes.map((r) => r.salespersonId?.toString()).filter((id): id is string => !!id))];
  const driverIds = [...new Set(routes.map((r) => r.driverId?.toString()).filter((id): id is string => !!id))];

  const [salespersons, drivers, assignments, pendingDeliveries] = await Promise.all([
    salespersonIds.length > 0 ? (Salesperson.find({ _id: { $in: salespersonIds }, clientId }).select('name').lean() as Promise<SalespersonDoc[]>) : Promise.resolve([]),
    driverIds.length > 0
      ? (Employee.find({ _id: { $in: driverIds }, clientId }).populate('userId', 'name').lean() as Promise<(EmployeeDoc & { userId: { name?: string } | null })[]>)
      : Promise.resolve([]),
    DeliveryAssignment.find({ clientId, routeId: { $in: routes.map((r) => r._id) } }).lean() as Promise<DeliveryAssignmentDoc[]>,
    computePendingDeliveries(clientId),
  ]);
  const spNameById = new Map(salespersons.map((s) => [s._id.toString(), s.name]));
  const driverNameById = new Map(drivers.map((d) => [d._id.toString(), d.userId?.name]));
  const pendingVolumeByRouteId = new Map<string, number>();
  for (const d of pendingDeliveries) {
    const routeId = d.assignment?.routeId;
    if (!routeId) continue;
    pendingVolumeByRouteId.set(routeId, (pendingVolumeByRouteId.get(routeId) ?? 0) + d.totalVolume);
  }

  const rows = routes.map((r) => {
    const id = r._id.toString();
    const deliveryCount = assignments.filter((a) => a.routeId?.toString() === id).length;
    return {
      routeId: id,
      code: r.code,
      name: r.name,
      territory: r.territory,
      salespersonName: r.salespersonId ? spNameById.get(r.salespersonId.toString()) : undefined,
      driverName: r.driverId ? driverNameById.get(r.driverId.toString()) : undefined,
      status: r.status,
      deliveryCount,
      pendingVolume: Math.round((pendingVolumeByRouteId.get(id) ?? 0) * 100) / 100,
    };
  });

  return res.status(200).json({
    asOf: new Date(),
    summary: {
      totalRoutes: rows.length,
      activeRoutes: rows.filter((r) => r.status === 'Active').length,
      routesWithNoDeliveries: rows.filter((r) => r.deliveryCount === 0).length,
    },
    rows,
  });
}

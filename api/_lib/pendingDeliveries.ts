import { SalesOrder, SalesOrderDoc } from './models/SalesOrder.js';
import { Customer, CustomerDoc } from './models/Customer.js';
import { DeliveryAssignment, DeliveryAssignmentDoc } from './models/DeliveryAssignment.js';
import { RouteModel, RouteDoc } from './models/Route.js';
import { FleetVehicle, FleetVehicleDoc } from './models/FleetVehicle.js';
import { Employee, EmployeeDoc } from './models/Employee.js';
import { Part, PartDoc } from './models/Part.js';
import { Client, ClientDoc } from './models/Client.js';
import { suggestVehicleType } from './deliveryLoad.js';

export interface PendingDeliveryItem {
  partId: string;
  name: string;
  orderedQuantity: number;
  deliveredQuantity: number;
  outstandingQuantity: number;
}

export interface PendingDeliveryComputed {
  salesOrderId: string;
  salesOrderNumber: string;
  customerId: string;
  customerName?: string;
  customerPhone?: string | null;
  orderStatus: string;
  orderCreatedAt: Date;
  items: PendingDeliveryItem[];
  totalVolume: number;
  suggestedVehicleType: string | null;
  assignment: {
    id: string;
    routeId?: string;
    routeName?: string;
    driverId?: string;
    driverName?: string;
    vehicleId?: string;
    vehicleNumber?: string;
    status: string;
    deliveryDate?: Date | null;
    notes?: string | null;
  } | null;
}

// "Pending delivery" = a SalesOrder with items still outstanding — the exact
// same status pair fulfill.ts treats as fulfillable. Not a new source of
// truth: reads SalesOrder directly, never duplicating it. Shared by the
// pending-deliveries route (SF-Phase 8/9) and the SF Dashboard (SF-Phase 11)
// so the "what's pending, how much volume" computation lives in one place.
export async function computePendingDeliveries(clientId: string): Promise<PendingDeliveryComputed[]> {
  const orders = (await SalesOrder.find({
    clientId,
    status: { $in: ['Confirmed', 'Partially Fulfilled'] },
  })
    .sort({ createdAt: 1 })
    .lean()) as SalesOrderDoc[];

  if (orders.length === 0) return [];

  const customerIds = [...new Set(orders.map((o) => o.customerId.toString()))];
  const orderIds = orders.map((o) => o._id.toString());
  const partIds = [...new Set(orders.flatMap((o) => o.items.map((i) => i.partId.toString())))];

  const [customers, assignments, parts, client] = await Promise.all([
    Customer.find({ _id: { $in: customerIds }, clientId }).lean() as Promise<CustomerDoc[]>,
    DeliveryAssignment.find({ salesOrderId: { $in: orderIds }, clientId }).lean() as Promise<DeliveryAssignmentDoc[]>,
    Part.find({ _id: { $in: partIds }, clientId }).select('unitVolume').lean() as Promise<PartDoc[]>,
    Client.findById(clientId).select('deliveryLoadRules').lean() as Promise<ClientDoc | null>,
  ]);
  const custById = new Map(customers.map((c) => [c._id.toString(), c]));
  const assignmentByOrderId = new Map(assignments.map((a) => [a.salesOrderId.toString(), a]));
  const volumeByPartId = new Map(parts.map((p) => [p._id.toString(), p.unitVolume ?? 0]));
  const loadRules = client?.deliveryLoadRules ?? [];

  const routeIds = [...new Set(assignments.map((a) => a.routeId?.toString()).filter((id): id is string => !!id))];
  const driverIds = [...new Set(assignments.map((a) => a.driverId?.toString()).filter((id): id is string => !!id))];
  const vehicleIds = [...new Set(assignments.map((a) => a.vehicleId?.toString()).filter((id): id is string => !!id))];

  const [routes, drivers, vehicles] = await Promise.all([
    routeIds.length > 0 ? (RouteModel.find({ _id: { $in: routeIds }, clientId }).lean() as Promise<RouteDoc[]>) : Promise.resolve([]),
    driverIds.length > 0
      ? (Employee.find({ _id: { $in: driverIds }, clientId }).populate('userId', 'name').lean() as Promise<(EmployeeDoc & { userId: { name?: string } | null })[]>)
      : Promise.resolve([]),
    vehicleIds.length > 0 ? (FleetVehicle.find({ _id: { $in: vehicleIds }, clientId }).lean() as Promise<FleetVehicleDoc[]>) : Promise.resolve([]),
  ]);
  const routeById = new Map(routes.map((r) => [r._id.toString(), r.name]));
  const driverById = new Map(drivers.map((d) => [d._id.toString(), d.userId?.name]));
  const vehicleById = new Map(vehicles.map((v) => [v._id.toString(), v.vehicleNumber]));

  return orders.map((o) => {
    const items = o.items
      .map((i) => ({
        partId: i.partId.toString(),
        name: i.name,
        orderedQuantity: i.quantity,
        deliveredQuantity: i.deliveredQuantity ?? 0,
        outstandingQuantity: i.quantity - (i.deliveredQuantity ?? 0),
      }))
      .filter((i) => i.outstandingQuantity > 0);

    const assignment = assignmentByOrderId.get(o._id.toString());
    const customer = custById.get(o.customerId.toString());

    // Total Delivery Volume = Σ part.unitVolume × outstanding quantity —
    // parts with no configured unitVolume contribute 0, never NaN/undefined.
    const totalVolume = o.items.reduce((sum, i) => {
      const outstanding = i.quantity - (i.deliveredQuantity ?? 0);
      if (outstanding <= 0) return sum;
      return sum + (volumeByPartId.get(i.partId.toString()) ?? 0) * outstanding;
    }, 0);

    return {
      salesOrderId: o._id.toString(),
      salesOrderNumber: o.salesOrderNumber,
      customerId: o.customerId.toString(),
      customerName: customer?.name,
      customerPhone: customer?.phone,
      orderStatus: o.status,
      orderCreatedAt: (o as unknown as { createdAt: Date }).createdAt,
      items,
      totalVolume: Math.round(totalVolume * 100) / 100,
      suggestedVehicleType: suggestVehicleType(totalVolume, loadRules),
      assignment: assignment
        ? {
            id: assignment._id.toString(),
            routeId: assignment.routeId?.toString(),
            routeName: assignment.routeId ? routeById.get(assignment.routeId.toString()) : undefined,
            driverId: assignment.driverId?.toString(),
            driverName: assignment.driverId ? driverById.get(assignment.driverId.toString()) : undefined,
            vehicleId: assignment.vehicleId?.toString(),
            vehicleNumber: assignment.vehicleId ? vehicleById.get(assignment.vehicleId.toString()) : undefined,
            status: assignment.status,
            deliveryDate: assignment.deliveryDate,
            notes: assignment.notes,
          }
        : null,
    };
  });
}

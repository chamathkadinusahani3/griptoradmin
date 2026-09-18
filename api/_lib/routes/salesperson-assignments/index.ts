import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { SalespersonAssignment, SalespersonAssignmentDoc, VISIT_FREQUENCIES, ASSIGNMENT_PRIORITIES, VISIT_DAYS } from '../../models/SalespersonAssignment.js';
import { Salesperson, SalespersonDoc } from '../../models/Salesperson.js';
import { Employee, EmployeeDoc } from '../../models/Employee.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { RouteModel, RouteDoc } from '../../models/Route.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeSalespersonAssignment } from '../../serializers.js';
import { resolveOrCreateSalespersonForUser } from '../../salespersonUserLink.js';

interface CreateAssignmentBody {
  salespersonId?: string;
  // Assign by tenant login instead of an existing Salesperson master-data
  // record — resolveOrCreateSalespersonForUser provisions whatever's
  // missing in the User -> Employee -> Salesperson chain so this specific
  // login reliably sees the dealer under "My Dealers". Only used when
  // salespersonId is omitted.
  userId?: string;
  customerId?: string;
  territory?: string;
  routeId?: string;
  visitFrequency?: (typeof VISIT_FREQUENCIES)[number];
  preferredVisitDay?: (typeof VISIT_DAYS)[number];
  priority?: (typeof ASSIGNMENT_PRIORITIES)[number];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function withNames(clientId: string, assignments: SalespersonAssignmentDoc[]) {
  if (assignments.length === 0) return [];

  const salespersonIds = [...new Set(assignments.map((a) => a.salespersonId.toString()))];
  const customerIds = [...new Set(assignments.map((a) => a.customerId.toString()))];
  const routeIds = [...new Set(assignments.map((a) => a.routeId?.toString()).filter((id): id is string => !!id))];

  const [salespersons, customers, routes] = await Promise.all([
    Salesperson.find({ _id: { $in: salespersonIds }, clientId }).lean() as Promise<SalespersonDoc[]>,
    Customer.find({ _id: { $in: customerIds }, clientId }).lean() as Promise<CustomerDoc[]>,
    routeIds.length > 0 ? (RouteModel.find({ _id: { $in: routeIds }, clientId }).lean() as Promise<RouteDoc[]>) : Promise.resolve([]),
  ]);
  const spById = new Map(salespersons.map((s) => [s._id.toString(), s]));
  const custById = new Map(customers.map((c) => [c._id.toString(), c]));
  const routeById = new Map(routes.map((r) => [r._id.toString(), r.name]));

  const employeeIds = [...new Set(salespersons.map((s) => s.employeeId?.toString()).filter((id): id is string => !!id))];
  const employees = employeeIds.length > 0 ? ((await Employee.find({ _id: { $in: employeeIds }, clientId }).lean()) as EmployeeDoc[]) : [];
  const userIdByEmployeeId = new Map(employees.map((e) => [e._id.toString(), e.userId.toString()]));

  return assignments.map((a) => {
    const sp = spById.get(a.salespersonId.toString());
    return serializeSalespersonAssignment(a, {
      salespersonName: sp?.name,
      salespersonCode: sp?.code,
      salespersonUserId: sp?.employeeId ? userIdByEmployeeId.get(sp.employeeId.toString()) : undefined,
      customerName: custById.get(a.customerId.toString())?.name,
      routeName: a.routeId ? routeById.get(a.routeId.toString()) : undefined,
    });
  });
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'sf-assignments:view');
  if (!session) return;

  const { salespersonId, customerId } = req.query;

  await connectToDatabase();
  const filter: Record<string, unknown> = { clientId: session.clientId };
  if (typeof salespersonId === 'string') filter.salespersonId = salespersonId;
  if (typeof customerId === 'string') filter.customerId = customerId;

  const assignments = (await SalespersonAssignment.find(filter).sort({ createdAt: -1 }).lean()) as SalespersonAssignmentDoc[];
  return res.status(200).json({ assignments: await withNames(session.clientId, assignments) });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'sf-assignments:manage');
  if (!session) return;

  const body = (req.body ?? {}) as CreateAssignmentBody;
  if ((!body.salespersonId && !body.userId) || !body.customerId) {
    return res.status(400).json({ error: 'salespersonId (or userId) and customerId are required' });
  }
  if (body.visitFrequency && !VISIT_FREQUENCIES.includes(body.visitFrequency)) {
    return res.status(400).json({ error: 'Invalid visitFrequency' });
  }
  if (body.priority && !ASSIGNMENT_PRIORITIES.includes(body.priority)) {
    return res.status(400).json({ error: 'Invalid priority' });
  }
  if (body.preferredVisitDay && !VISIT_DAYS.includes(body.preferredVisitDay)) {
    return res.status(400).json({ error: 'Invalid preferredVisitDay' });
  }

  await connectToDatabase();

  let salespersonId = body.salespersonId;
  if (!salespersonId && body.userId) {
    const resolved = await resolveOrCreateSalespersonForUser(session.clientId, body.userId);
    if ('error' in resolved) return res.status(400).json({ error: resolved.error });
    salespersonId = resolved.salespersonId;
  }

  const [salesperson, customer] = await Promise.all([
    Salesperson.findOne({ _id: salespersonId, clientId: session.clientId }).lean(),
    Customer.findOne({ _id: body.customerId, clientId: session.clientId }).lean(),
  ]);
  if (!salesperson) return res.status(400).json({ error: 'Salesperson not found' });
  if (!customer) return res.status(400).json({ error: 'Customer not found' });
  if (body.routeId) {
    const route = await RouteModel.findOne({ _id: body.routeId, clientId: session.clientId }).lean();
    if (!route) return res.status(400).json({ error: 'Route not found' });
  }

  const existing = await SalespersonAssignment.findOne({
    clientId: session.clientId,
    salespersonId,
    customerId: body.customerId,
  }).lean();
  if (existing) return res.status(400).json({ error: 'This salesperson is already assigned to this customer' });

  const assignment = await SalespersonAssignment.create({
    clientId: session.clientId,
    routeId: body.routeId || undefined,
    salespersonId,
    customerId: body.customerId,
    territory: body.territory,
    visitFrequency: body.visitFrequency ?? 'Weekly',
    preferredVisitDay: body.preferredVisitDay,
    priority: body.priority ?? 'Medium',
  });

  const [serialized] = await withNames(session.clientId, [assignment.toObject()]);
  return res.status(201).json({ assignment: serialized });
}

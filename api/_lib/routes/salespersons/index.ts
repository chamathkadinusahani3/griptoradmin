import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Salesperson, SalespersonDoc } from '../../models/Salesperson.js';
import { Employee, EmployeeDoc } from '../../models/Employee.js';
import { RouteModel, RouteDoc } from '../../models/Route.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeSalesperson } from '../../serializers.js';

interface CreateSalespersonBody {
  code?: string;
  name?: string;
  employeeId?: string;
  mobile?: string;
  email?: string;
  territory?: string;
  routeId?: string;
  target?: number;
  commissionPct?: number;
  gpsTrackingEnabled?: boolean;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function withEmployeeNames(clientId: string, salespersons: SalespersonDoc[]) {
  if (salespersons.length === 0) return [];

  const employeeIds = salespersons.map((s) => s.employeeId).filter((id): id is NonNullable<typeof id> => !!id);
  const routeIds = salespersons.map((s) => s.routeId).filter((id): id is NonNullable<typeof id> => !!id);

  const [employees, routes] = await Promise.all([
    employeeIds.length > 0
      ? (Employee.find({ _id: { $in: employeeIds }, clientId }).populate('userId', 'name').lean() as Promise<(EmployeeDoc & { userId: { name?: string } | null })[]>)
      : Promise.resolve([]),
    routeIds.length > 0 ? (RouteModel.find({ _id: { $in: routeIds }, clientId }).lean() as Promise<RouteDoc[]>) : Promise.resolve([]),
  ]);
  const employeeNameById = new Map(employees.map((e) => [e._id.toString(), e.userId?.name]));
  const routeNameById = new Map(routes.map((r) => [r._id.toString(), r.name]));

  return salespersons.map((s) =>
    serializeSalesperson(
      s,
      s.employeeId ? employeeNameById.get(s.employeeId.toString()) : undefined,
      s.routeId ? routeNameById.get(s.routeId.toString()) : undefined
    )
  );
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'salespersons:view');
  if (!session) return;

  await connectToDatabase();
  const salespersons = (await Salesperson.find({ clientId: session.clientId }).sort({ name: 1 }).lean()) as SalespersonDoc[];
  return res.status(200).json({ salespersons: await withEmployeeNames(session.clientId, salespersons) });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'salespersons:manage');
  if (!session) return;

  const body = (req.body ?? {}) as CreateSalespersonBody;
  if (!body.code || !body.code.trim() || !body.name || !body.name.trim()) {
    return res.status(400).json({ error: 'code and name are required' });
  }

  await connectToDatabase();

  const existing = await Salesperson.findOne({ clientId: session.clientId, code: body.code.trim() }).lean();
  if (existing) return res.status(400).json({ error: 'A salesperson with this code already exists' });

  if (body.employeeId) {
    const employee = await Employee.findOne({ _id: body.employeeId, clientId: session.clientId }).lean();
    if (!employee) return res.status(400).json({ error: 'Employee not found' });
  }
  if (body.routeId) {
    const route = await RouteModel.findOne({ _id: body.routeId, clientId: session.clientId }).lean();
    if (!route) return res.status(400).json({ error: 'Route not found' });
  }
  if (body.commissionPct != null && (body.commissionPct < 0 || body.commissionPct > 100)) {
    return res.status(400).json({ error: 'commissionPct must be between 0 and 100' });
  }

  const salesperson = await Salesperson.create({
    clientId: session.clientId,
    code: body.code.trim(),
    name: body.name.trim(),
    employeeId: body.employeeId || undefined,
    mobile: body.mobile,
    email: body.email,
    territory: body.territory,
    routeId: body.routeId || undefined,
    target: body.target ?? 0,
    commissionPct: body.commissionPct ?? 0,
    gpsTrackingEnabled: body.gpsTrackingEnabled ?? true,
  });

  const [serialized] = await withEmployeeNames(session.clientId, [salesperson.toObject()]);
  return res.status(201).json({ salesperson: serialized });
}

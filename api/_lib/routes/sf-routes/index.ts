import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { RouteModel, RouteDoc } from '../../models/Route.js';
import { Salesperson, SalespersonDoc } from '../../models/Salesperson.js';
import { Employee, EmployeeDoc } from '../../models/Employee.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeRoute } from '../../serializers.js';

interface CreateRouteBody {
  code?: string;
  name?: string;
  territory?: string;
  towns?: string[];
  postalCodes?: string[];
  salespersonId?: string;
  driverId?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function withNames(clientId: string, routes: RouteDoc[]) {
  if (routes.length === 0) return [];

  const salespersonIds = [...new Set(routes.map((r) => r.salespersonId?.toString()).filter((id): id is string => !!id))];
  const driverIds = [...new Set(routes.map((r) => r.driverId?.toString()).filter((id): id is string => !!id))];

  const [salespersons, drivers] = await Promise.all([
    Salesperson.find({ _id: { $in: salespersonIds }, clientId }).lean() as Promise<SalespersonDoc[]>,
    Employee.find({ _id: { $in: driverIds }, clientId }).populate('userId', 'name').lean() as Promise<(EmployeeDoc & { userId: { name?: string } | null })[]>,
  ]);
  const spById = new Map(salespersons.map((s) => [s._id.toString(), s.name]));
  const driverById = new Map(drivers.map((d) => [d._id.toString(), d.userId?.name]));

  return routes.map((r) =>
    serializeRoute(r, {
      salespersonName: r.salespersonId ? spById.get(r.salespersonId.toString()) : undefined,
      driverName: r.driverId ? driverById.get(r.driverId.toString()) : undefined,
    })
  );
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'sf-routes:view');
  if (!session) return;

  await connectToDatabase();
  const routes = (await RouteModel.find({ clientId: session.clientId }).sort({ code: 1 }).lean()) as RouteDoc[];
  return res.status(200).json({ routes: await withNames(session.clientId, routes) });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'sf-routes:manage');
  if (!session) return;

  const body = (req.body ?? {}) as CreateRouteBody;
  if (!body.code || !body.code.trim() || !body.name || !body.name.trim()) {
    return res.status(400).json({ error: 'code and name are required' });
  }

  await connectToDatabase();

  const existing = await RouteModel.findOne({ clientId: session.clientId, code: body.code.trim() }).lean();
  if (existing) return res.status(400).json({ error: 'A route with this code already exists' });

  if (body.salespersonId) {
    const sp = await Salesperson.findOne({ _id: body.salespersonId, clientId: session.clientId }).lean();
    if (!sp) return res.status(400).json({ error: 'Salesperson not found' });
  }
  if (body.driverId) {
    const driver = await Employee.findOne({ _id: body.driverId, clientId: session.clientId }).lean();
    if (!driver) return res.status(400).json({ error: 'Driver not found' });
  }

  const route = await RouteModel.create({
    clientId: session.clientId,
    code: body.code.trim(),
    name: body.name.trim(),
    territory: body.territory,
    towns: (body.towns ?? []).map((t) => t.trim()).filter(Boolean),
    postalCodes: (body.postalCodes ?? []).map((p) => p.trim()).filter(Boolean),
    salespersonId: body.salespersonId || undefined,
    driverId: body.driverId || undefined,
  });

  const [serialized] = await withNames(session.clientId, [route.toObject()]);
  return res.status(201).json({ route: serialized });
}

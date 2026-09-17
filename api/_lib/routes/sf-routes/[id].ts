import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { RouteModel, RouteDoc } from '../../models/Route.js';
import { Salesperson, SalespersonDoc } from '../../models/Salesperson.js';
import { Employee, EmployeeDoc } from '../../models/Employee.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeRoute } from '../../serializers.js';

interface UpdateRouteBody {
  code?: string;
  name?: string;
  territory?: string;
  towns?: string[];
  postalCodes?: string[];
  salespersonId?: string | null;
  driverId?: string | null;
  status?: 'Active' | 'Inactive';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'PATCH') return handleUpdate(req, res);
  if (req.method === 'DELETE') return handleDelete(req, res);
  res.setHeader('Allow', 'PATCH, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleUpdate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'sf-routes:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing route id' });

  const body = (req.body ?? {}) as UpdateRouteBody;
  if (body.code !== undefined && !body.code.trim()) return res.status(400).json({ error: 'code cannot be empty' });
  if (body.name !== undefined && !body.name.trim()) return res.status(400).json({ error: 'name cannot be empty' });
  if (body.status !== undefined && !['Active', 'Inactive'].includes(body.status)) {
    return res.status(400).json({ error: 'status must be "Active" or "Inactive"' });
  }

  await connectToDatabase();

  if (body.code !== undefined) {
    const duplicate = await RouteModel.findOne({ clientId: session.clientId, code: body.code.trim(), _id: { $ne: id } }).lean();
    if (duplicate) return res.status(400).json({ error: 'A route with this code already exists' });
  }
  if (body.salespersonId) {
    const sp = await Salesperson.findOne({ _id: body.salespersonId, clientId: session.clientId }).lean();
    if (!sp) return res.status(400).json({ error: 'Salesperson not found' });
  }
  if (body.driverId) {
    const driver = await Employee.findOne({ _id: body.driverId, clientId: session.clientId }).lean();
    if (!driver) return res.status(400).json({ error: 'Driver not found' });
  }

  const update: Record<string, unknown> = {};
  if (body.code !== undefined) update.code = body.code.trim();
  if (body.name !== undefined) update.name = body.name.trim();
  if (body.territory !== undefined) update.territory = body.territory;
  if (body.towns !== undefined) update.towns = body.towns.map((t) => t.trim()).filter(Boolean);
  if (body.postalCodes !== undefined) update.postalCodes = body.postalCodes.map((p) => p.trim()).filter(Boolean);
  if (body.salespersonId !== undefined) update.salespersonId = body.salespersonId || undefined;
  if (body.driverId !== undefined) update.driverId = body.driverId || undefined;
  if (body.status !== undefined) update.status = body.status;

  const route = (await RouteModel.findOneAndUpdate(
    { _id: id, clientId: session.clientId },
    update,
    { returnDocument: 'after' }
  ).lean()) as RouteDoc | null;
  if (!route) return res.status(404).json({ error: 'Route not found' });

  const [salesperson, driver] = await Promise.all([
    route.salespersonId ? (Salesperson.findOne({ _id: route.salespersonId, clientId: session.clientId }).lean() as Promise<SalespersonDoc | null>) : null,
    route.driverId
      ? (Employee.findOne({ _id: route.driverId, clientId: session.clientId }).populate('userId', 'name').lean() as Promise<(EmployeeDoc & { userId: { name?: string } | null }) | null>)
      : null,
  ]);

  return res.status(200).json({
    route: serializeRoute(route, { salespersonName: salesperson?.name, driverName: driver?.userId?.name }),
  });
}

async function handleDelete(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'sf-routes:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing route id' });

  await connectToDatabase();
  const deleted = await RouteModel.findOneAndDelete({ _id: id, clientId: session.clientId }).lean();
  if (!deleted) return res.status(404).json({ error: 'Route not found' });

  return res.status(204).end();
}

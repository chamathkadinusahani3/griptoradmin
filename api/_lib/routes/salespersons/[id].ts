import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Salesperson, SalespersonDoc } from '../../models/Salesperson.js';
import { Employee, EmployeeDoc } from '../../models/Employee.js';
import { RouteModel, RouteDoc } from '../../models/Route.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeSalesperson } from '../../serializers.js';

interface UpdateSalespersonBody {
  code?: string;
  name?: string;
  employeeId?: string | null;
  mobile?: string;
  email?: string;
  territory?: string;
  routeId?: string | null;
  target?: number;
  commissionPct?: number;
  status?: 'Active' | 'Inactive';
  gpsTrackingEnabled?: boolean;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'PATCH') return handleUpdate(req, res);
  if (req.method === 'DELETE') return handleDelete(req, res);
  res.setHeader('Allow', 'PATCH, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleUpdate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'salespersons:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing salesperson id' });

  const body = (req.body ?? {}) as UpdateSalespersonBody;
  if (body.code !== undefined && !body.code.trim()) return res.status(400).json({ error: 'code cannot be empty' });
  if (body.name !== undefined && !body.name.trim()) return res.status(400).json({ error: 'name cannot be empty' });
  if (body.status !== undefined && !['Active', 'Inactive'].includes(body.status)) {
    return res.status(400).json({ error: 'status must be "Active" or "Inactive"' });
  }
  if (body.commissionPct != null && (body.commissionPct < 0 || body.commissionPct > 100)) {
    return res.status(400).json({ error: 'commissionPct must be between 0 and 100' });
  }

  await connectToDatabase();

  if (body.code !== undefined) {
    const duplicate = await Salesperson.findOne({ clientId: session.clientId, code: body.code.trim(), _id: { $ne: id } }).lean();
    if (duplicate) return res.status(400).json({ error: 'A salesperson with this code already exists' });
  }
  if (body.employeeId) {
    const employee = await Employee.findOne({ _id: body.employeeId, clientId: session.clientId }).lean();
    if (!employee) return res.status(400).json({ error: 'Employee not found' });
  }
  if (body.routeId) {
    const route = await RouteModel.findOne({ _id: body.routeId, clientId: session.clientId }).lean();
    if (!route) return res.status(400).json({ error: 'Route not found' });
  }

  const update: Record<string, unknown> = {};
  if (body.code !== undefined) update.code = body.code.trim();
  if (body.name !== undefined) update.name = body.name.trim();
  if (body.employeeId !== undefined) update.employeeId = body.employeeId || undefined;
  if (body.mobile !== undefined) update.mobile = body.mobile;
  if (body.email !== undefined) update.email = body.email;
  if (body.territory !== undefined) update.territory = body.territory;
  if (body.routeId !== undefined) update.routeId = body.routeId || undefined;
  if (body.target !== undefined) update.target = body.target;
  if (body.commissionPct !== undefined) update.commissionPct = body.commissionPct;
  if (body.status !== undefined) update.status = body.status;
  if (body.gpsTrackingEnabled !== undefined) update.gpsTrackingEnabled = body.gpsTrackingEnabled;

  const salesperson = (await Salesperson.findOneAndUpdate(
    { _id: id, clientId: session.clientId },
    update,
    { returnDocument: 'after' }
  ).lean()) as SalespersonDoc | null;
  if (!salesperson) return res.status(404).json({ error: 'Salesperson not found' });

  const [employee, route] = await Promise.all([
    salesperson.employeeId
      ? (Employee.findOne({ _id: salesperson.employeeId, clientId: session.clientId }).populate('userId', 'name').lean() as Promise<(EmployeeDoc & { userId: { name?: string } | null }) | null>)
      : null,
    salesperson.routeId ? (RouteModel.findOne({ _id: salesperson.routeId, clientId: session.clientId }).lean() as Promise<RouteDoc | null>) : null,
  ]);

  return res.status(200).json({ salesperson: serializeSalesperson(salesperson, employee?.userId?.name, route?.name) });
}

async function handleDelete(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'salespersons:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing salesperson id' });

  await connectToDatabase();
  const deleted = await Salesperson.findOneAndDelete({ _id: id, clientId: session.clientId }).lean();
  if (!deleted) return res.status(404).json({ error: 'Salesperson not found' });

  return res.status(204).end();
}

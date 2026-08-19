import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Department, DepartmentDoc } from '../../models/Department.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeDepartment } from '../../serializers.js';

interface UpdateDepartmentBody {
  name?: string;
  description?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'PATCH') return handleUpdate(req, res);
  if (req.method === 'DELETE') return handleDelete(req, res);
  res.setHeader('Allow', 'PATCH, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleUpdate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'departments:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing department id' });

  const body = (req.body ?? {}) as UpdateDepartmentBody;
  if (body.name !== undefined && !body.name.trim()) {
    return res.status(400).json({ error: 'name cannot be empty' });
  }

  await connectToDatabase();

  const update: Record<string, unknown> = {};
  if (body.name !== undefined) update.name = body.name.trim();
  if (body.description !== undefined) update.description = body.description;

  const department = (await Department.findOneAndUpdate(
    { _id: id, clientId: session.clientId },
    update,
    { returnDocument: 'after' }
  ).lean()) as DepartmentDoc | null;
  if (!department) return res.status(404).json({ error: 'Department not found' });

  return res.status(200).json({ department: serializeDepartment(department) });
}

async function handleDelete(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'departments:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing department id' });

  await connectToDatabase();
  const deleted = await Department.findOneAndDelete({ _id: id, clientId: session.clientId }).lean();
  if (!deleted) return res.status(404).json({ error: 'Department not found' });

  return res.status(204).end();
}

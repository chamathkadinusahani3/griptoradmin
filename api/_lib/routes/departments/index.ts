import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Department, DepartmentDoc } from '../../models/Department.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeDepartment } from '../../serializers.js';

interface CreateDepartmentBody {
  name?: string;
  description?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'departments:view');
  if (!session) return;

  await connectToDatabase();
  const departments = (await Department.find({ clientId: session.clientId }).sort({ name: 1 }).lean()) as DepartmentDoc[];
  return res.status(200).json({ departments: departments.map(serializeDepartment) });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'departments:manage');
  if (!session) return;

  const { name, description } = (req.body ?? {}) as CreateDepartmentBody;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }

  await connectToDatabase();
  const department = await Department.create({ clientId: session.clientId, name: name.trim(), description });

  return res.status(201).json({ department: serializeDepartment(department.toObject()) });
}

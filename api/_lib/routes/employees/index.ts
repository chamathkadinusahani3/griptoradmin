import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { User, UserDoc } from '../../models/User.js';
import { Employee, EmployeeDoc } from '../../models/Employee.js';
import { Role, RoleDoc } from '../../models/Role.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeEmployee } from '../../serializers.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'employees:view');
  if (!session) return;

  await connectToDatabase();

  const staff = (await User.find({ clientId: session.clientId, role: 'tenant' }).sort({ name: 1 }).lean()) as UserDoc[];
  const employees = (await Employee.find({ clientId: session.clientId }).lean()) as EmployeeDoc[];
  const employeeByUserId = new Map(employees.map((e) => [e.userId.toString(), e]));
  const roles = (await Role.find({ clientId: session.clientId }).lean()) as RoleDoc[];
  const roleById = new Map(roles.map((r) => [r._id.toString(), r]));

  return res.status(200).json({
    employees: staff.map((u) => {
      const roleName = u.roleId ? roleById.get(u.roleId.toString())?.name : undefined;
      return serializeEmployee(u._id.toString(), u.name, u.email, roleName ?? u.tenantRole, employeeByUserId.get(u._id.toString()) ?? null);
    }),
  });
}

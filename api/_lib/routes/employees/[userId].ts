import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { User, UserDoc } from '../../models/User.js';
import { Employee, EmployeeDoc, EMPLOYMENT_TYPES } from '../../models/Employee.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeEmployee } from '../../serializers.js';

interface UpdateEmployeeBody {
  dateOfBirth?: string;
  address?: string;
  nationalId?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  hireDate?: string;
  employmentType?: string;
  notes?: string;
  hourlyRate?: number | null;
  active?: boolean;
  departmentId?: string | null;
}

// One endpoint handles both "add a profile" and "edit an existing one" via
// upsert — matches the create-or-edit-in-one-modal UX already used for
// branding/settings elsewhere in this app, avoiding a separate create route.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'employees:edit');
  if (!session) return;

  const { userId } = req.query;
  if (typeof userId !== 'string') return res.status(400).json({ error: 'Missing user id' });

  const body = (req.body ?? {}) as UpdateEmployeeBody;
  if (body.employmentType !== undefined && !(EMPLOYMENT_TYPES as readonly string[]).includes(body.employmentType)) {
    return res.status(400).json({ error: `employmentType must be one of: ${EMPLOYMENT_TYPES.join(', ')}` });
  }

  await connectToDatabase();

  const user = (await User.findOne({ _id: userId, clientId: session.clientId, role: 'tenant' }).lean()) as UserDoc | null;
  if (!user) return res.status(404).json({ error: 'Staff member not found' });

  const update: Record<string, unknown> = {};
  if (body.address !== undefined) update.address = body.address;
  if (body.nationalId !== undefined) update.nationalId = body.nationalId;
  if (body.emergencyContactName !== undefined) update.emergencyContactName = body.emergencyContactName;
  if (body.emergencyContactPhone !== undefined) update.emergencyContactPhone = body.emergencyContactPhone;
  if (body.employmentType !== undefined) update.employmentType = body.employmentType;
  if (body.notes !== undefined) update.notes = body.notes;
  if (body.dateOfBirth !== undefined) update.dateOfBirth = body.dateOfBirth ? new Date(body.dateOfBirth) : undefined;
  if (body.hireDate !== undefined) update.hireDate = body.hireDate ? new Date(body.hireDate) : undefined;
  if (body.hourlyRate !== undefined) update.hourlyRate = body.hourlyRate ?? undefined;
  if (body.active !== undefined) update.active = body.active;
  if (body.departmentId !== undefined) update.departmentId = body.departmentId || undefined;

  const employee = (await Employee.findOneAndUpdate(
    { clientId: session.clientId, userId },
    { clientId: session.clientId, userId, ...update },
    { upsert: true, returnDocument: 'after' }
  ).lean()) as EmployeeDoc;

  return res.status(200).json({
    employee: serializeEmployee(user._id.toString(), user.name, user.email, user.tenantRole, employee),
  });
}

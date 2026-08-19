import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { SalaryAdvance, SalaryAdvanceDoc } from '../../models/SalaryAdvance.js';
import { Technician, TechnicianDoc } from '../../models/Technician.js';
import { Employee, EmployeeDoc } from '../../models/Employee.js';
import { User, UserDoc } from '../../models/User.js';
import { requireTenantPermission } from '../../auth.js';
import { generateSequentialNumber } from '../../numbering.js';
import { serializeSalaryAdvance } from '../../serializers.js';

interface CreateAdvanceBody {
  subjectType?: 'technician' | 'employee';
  subjectId?: string;
  amount?: number;
  reason?: string;
  notes?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'payroll:view');
  if (!session) return;

  await connectToDatabase();
  const advances = (await SalaryAdvance.find({ clientId: session.clientId }).sort({ createdAt: -1 }).lean()) as SalaryAdvanceDoc[];
  const approverIds = [...new Set(advances.map((a) => a.approvedBy?.toString()).filter(Boolean) as string[])];
  const approvers = (await User.find({ _id: { $in: approverIds } }).select('name').lean()) as UserDoc[];
  const nameById = new Map(approvers.map((u) => [u._id.toString(), u.name]));

  return res.status(200).json({
    advances: advances.map((a) => serializeSalaryAdvance(a, a.approvedBy ? nameById.get(a.approvedBy.toString()) : undefined)),
  });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'payroll:manage');
  if (!session) return;

  const { subjectType, subjectId, amount, reason, notes } = (req.body ?? {}) as CreateAdvanceBody;
  if (!subjectType || !subjectId || !amount || amount <= 0) {
    return res.status(400).json({ error: 'subjectType, subjectId, and a positive amount are required' });
  }

  await connectToDatabase();

  let subjectName: string;
  if (subjectType === 'technician') {
    const tech = (await Technician.findOne({ _id: subjectId, clientId: session.clientId }).lean()) as TechnicianDoc | null;
    if (!tech) return res.status(400).json({ error: 'Unknown technician' });
    subjectName = tech.name;
  } else if (subjectType === 'employee') {
    const emp = (await Employee.findOne({ _id: subjectId, clientId: session.clientId }).lean()) as EmployeeDoc | null;
    if (!emp) return res.status(400).json({ error: 'Unknown employee' });
    const user = (await User.findById(emp.userId).select('name').lean()) as { name: string } | null;
    subjectName = user?.name ?? 'Unknown employee';
  } else {
    return res.status(400).json({ error: 'subjectType must be technician or employee' });
  }

  const advanceNumber = await generateSequentialNumber(SalaryAdvance, session.clientId, 'advanceNumber', 'salaryAdvance');

  const advance = await SalaryAdvance.create({
    clientId: session.clientId,
    advanceNumber,
    technicianId: subjectType === 'technician' ? subjectId : undefined,
    employeeId: subjectType === 'employee' ? subjectId : undefined,
    subjectName,
    amount,
    reason,
    notes,
  });

  return res.status(201).json({ advance: serializeSalaryAdvance(advance.toObject()) });
}

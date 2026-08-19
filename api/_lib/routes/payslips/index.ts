import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Payslip, PayslipDoc } from '../../models/Payslip.js';
import { requireTenantPermission } from '../../auth.js';
import { serializePayslip } from '../../serializers.js';

// Read-only — a Payslip only ever exists as a side effect of finalizing a
// PayrollRun (payroll-runs/[id].ts), same reasoning as
// goods-received-notes/index.ts.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'payroll:view');
  if (!session) return;

  await connectToDatabase();
  const { technicianId, employeeId } = req.query;
  const filter: Record<string, unknown> = { clientId: session.clientId };
  if (typeof technicianId === 'string') filter.technicianId = technicianId;
  if (typeof employeeId === 'string') filter.employeeId = employeeId;

  const payslips = (await Payslip.find(filter).sort({ periodStart: -1 }).lean()) as PayslipDoc[];
  return res.status(200).json({ payslips: payslips.map(serializePayslip) });
}

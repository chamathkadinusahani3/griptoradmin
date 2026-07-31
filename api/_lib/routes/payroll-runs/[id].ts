import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { PayrollRun, PayrollRunDoc } from '../../models/PayrollRun.js';
import { requireTenantPermission } from '../../auth.js';
import { serializePayrollRun } from '../../serializers.js';

interface UpdateRunBody {
  lines?: { technicianId?: string; hoursWorked?: number }[];
  action?: 'finalize' | 'markPaid';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'payroll:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing payroll run id' });

  await connectToDatabase();

  const existing = (await PayrollRun.findOne({ _id: id, clientId: session.clientId }).lean()) as PayrollRunDoc | null;
  if (!existing) return res.status(404).json({ error: 'Payroll run not found' });

  const body = (req.body ?? {}) as UpdateRunBody;

  if (body.action === 'finalize') {
    if (existing.status !== 'Draft') return res.status(400).json({ error: 'Only a Draft run can be finalized' });
    const updated = (await PayrollRun.findOneAndUpdate(
      { _id: id, clientId: session.clientId, status: 'Draft' },
      { status: 'Finalized', finalizedAt: new Date() },
      { returnDocument: 'after' }
    ).lean()) as PayrollRunDoc | null;
    if (!updated) return res.status(400).json({ error: 'This run is no longer Draft' });
    return res.status(200).json({ payrollRun: serializePayrollRun(updated) });
  }

  if (body.action === 'markPaid') {
    if (existing.status !== 'Finalized') return res.status(400).json({ error: 'Only a Finalized run can be marked Paid' });
    const updated = (await PayrollRun.findOneAndUpdate(
      { _id: id, clientId: session.clientId, status: 'Finalized' },
      { status: 'Paid', paidAt: new Date() },
      { returnDocument: 'after' }
    ).lean()) as PayrollRunDoc | null;
    if (!updated) return res.status(400).json({ error: 'This run is no longer Finalized' });
    return res.status(200).json({ payrollRun: serializePayrollRun(updated) });
  }

  // Manual hour corrections — only while still Draft, same status-lock
  // convention as Quotation/PurchaseOrder editing. grossPay is always
  // recomputed from the line's own snapshotted hourlyRate, never trusted
  // from the client — a technician with no rate stays at 0/missingRate,
  // never a guessed number.
  if (existing.status !== 'Draft') {
    return res.status(400).json({ error: 'Only a Draft run can be edited' });
  }
  if (!body.lines || body.lines.length === 0) {
    return res.status(400).json({ error: 'No changes provided' });
  }

  const hoursByTechnician = new Map(body.lines.map((l) => [l.technicianId, l.hoursWorked]));
  const updatedLines = existing.lines.map((line) => {
    const newHours = hoursByTechnician.get(line.technicianId.toString());
    if (newHours == null || newHours < 0) return line;
    const grossPay = line.missingRate ? 0 : Math.round(newHours * (line.hourlyRate ?? 0) * 100) / 100;
    return { ...line, hoursWorked: newHours, grossPay };
  });
  const totalAmount = Math.round(updatedLines.reduce((sum, l) => sum + l.grossPay, 0) * 100) / 100;

  const updated = (await PayrollRun.findOneAndUpdate(
    { _id: id, clientId: session.clientId, status: 'Draft' },
    { lines: updatedLines, totalAmount },
    { returnDocument: 'after' }
  ).lean()) as PayrollRunDoc | null;
  if (!updated) return res.status(400).json({ error: 'This run is no longer Draft' });

  return res.status(200).json({ payrollRun: serializePayrollRun(updated) });
}

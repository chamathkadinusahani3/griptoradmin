import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { PayrollRun, PayrollRunDoc } from '../../models/PayrollRun.js';
import { Payslip } from '../../models/Payslip.js';
import { requireTenantPermission } from '../../auth.js';
import { postJournalEntry, getAccountIdsByNames } from '../../journal.js';
import { serializePayrollRun } from '../../serializers.js';

interface UpdateRunBody {
  lines?: { technicianId?: string; employeeId?: string; hoursWorked?: number }[];
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

    // Best-effort, outside any transaction — same reasoning as
    // expenses/index.ts's identical block. Finalize (not markPaid) is the
    // scoped GL hook point: treats a finalized run as both expense-
    // recognized and paid via Bank in one step (payroll is almost always
    // bank-transferred, and PayrollRun has no per-run payment-method field
    // to ask, unlike Expense/Sale).
    try {
      if (updated.totalAmount > 0) {
        const accountIds = await getAccountIdsByNames(session.clientId, ['Salaries Expense', 'Bank']);
        const salariesId = accountIds.get('Salaries Expense');
        const bankId = accountIds.get('Bank');
        if (salariesId && bankId) {
          await postJournalEntry({
            clientId: session.clientId,
            description: `Payroll run finalized`,
            sourceType: 'payroll',
            sourceId: id,
            lines: [{ accountId: salariesId, debit: updated.totalAmount }, { accountId: bankId, credit: updated.totalAmount }],
          });
        }
      }
    } catch (err) {
      console.error('Journal posting failed for payroll run', id, err);
    }

    // Best-effort, same reasoning as the GL posting above — one persisted
    // Payslip per line, so "every payslip for this person" is a real query
    // instead of scanning PayrollRun documents. Skips lines with 0 hours
    // (already filtered out of the run at generation time, but defensive
    // here too since these are lines, not a fresh generation).
    try {
      if (updated.lines.length > 0) {
        await Payslip.insertMany(
          updated.lines.map((l) => ({
            clientId: session.clientId,
            payrollRunId: id,
            technicianId: l.technicianId,
            employeeId: l.employeeId,
            subjectName: l.technicianName,
            periodStart: updated.periodStart,
            periodEnd: updated.periodEnd,
            hourlyRate: l.hourlyRate,
            hoursWorked: l.hoursWorked,
            grossPay: l.grossPay,
            missingRate: l.missingRate,
          })),
          { ordered: false }
        );
      }
    } catch (err) {
      console.error('Payslip creation failed for payroll run', id, err);
    }

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

  // Keyed by whichever id the line actually has (technician OR employee —
  // see PayrollRun.ts's comment on why exactly one is ever set per line).
  const hoursBySubject = new Map(body.lines.map((l) => [l.technicianId ?? l.employeeId, l.hoursWorked]));
  const updatedLines = existing.lines.map((line) => {
    const subjectKey = (line.technicianId ?? line.employeeId)?.toString();
    const newHours = subjectKey ? hoursBySubject.get(subjectKey) : undefined;
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

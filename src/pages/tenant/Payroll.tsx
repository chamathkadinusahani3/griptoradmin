import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { BanknoteIcon, PlusIcon, DownloadIcon, AlertTriangleIcon, ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { StatusBadge } from '../../components/StatusBadge';
import { Modal } from '../../components/ui/Modal';
import { Input, Label } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { PayrollRun } from '../../types/payroll';
import { formatCurrency, formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { downloadPayslipPdf } from '../../lib/pdf';

export function Payroll() {
  const { user } = useAuth();
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [generating, setGenerating] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [hoursDraft, setHoursDraft] = useState<Record<string, string>>({});
  const [savingHours, setSavingHours] = useState(false);

  const loadRuns = () => {
    api
      .get<{ payrollRuns: PayrollRun[] }>('/payroll-runs')
      .then(({ payrollRuns }) => setRuns(payrollRuns))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load payroll runs'))
      .finally(() => setLoading(false));
  };

  useEffect(loadRuns, []);

  const openGenerate = () => {
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    setPeriodStart(firstOfMonth);
    setPeriodEnd(now.toISOString().slice(0, 10));
    setModalOpen(true);
  };

  const generate = async () => {
    if (!periodStart || !periodEnd) {
      toast.error('Both period dates are required');
      return;
    }
    setGenerating(true);
    try {
      const { payrollRun } = await api.post<{ payrollRun: PayrollRun }>('/payroll-runs', { periodStart, periodEnd });
      setRuns((prev) => [payrollRun, ...prev]);
      setExpandedId(payrollRun.id);
      toast.success('Payroll run generated');
      setModalOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to generate payroll run');
    } finally {
      setGenerating(false);
    }
  };

  // Exactly one of technicianId/employeeId is set per line (Phase 9
  // extended payroll to cover Employees) — this is the shared key used
  // wherever a line needs a stable identity: React keys, the hours-draft
  // dictionary, and the hour-correction PATCH body.
  const lineKey = (line: PayrollRun['lines'][number]) => line.technicianId ?? line.employeeId ?? line.technicianName;

  const toggleExpand = (run: PayrollRun) => {
    if (expandedId === run.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(run.id);
    setHoursDraft(Object.fromEntries(run.lines.map((l) => [lineKey(l), String(l.hoursWorked)])));
  };

  const finalize = async (run: PayrollRun) => {
    setActingId(run.id);
    try {
      const { payrollRun } = await api.patch<{ payrollRun: PayrollRun }>(`/payroll-runs/${run.id}`, { action: 'finalize' });
      setRuns((prev) => prev.map((r) => (r.id === run.id ? payrollRun : r)));
      toast.success('Payroll run finalized — hours are now locked');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to finalize');
    } finally {
      setActingId(null);
    }
  };

  const markPaid = async (run: PayrollRun) => {
    setActingId(run.id);
    try {
      const { payrollRun } = await api.patch<{ payrollRun: PayrollRun }>(`/payroll-runs/${run.id}`, { action: 'markPaid' });
      setRuns((prev) => prev.map((r) => (r.id === run.id ? payrollRun : r)));
      toast.success('Marked as paid');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to mark as paid');
    } finally {
      setActingId(null);
    }
  };

  const saveHourCorrections = async (run: PayrollRun) => {
    setSavingHours(true);
    try {
      const lines = run.lines.map((l) => ({
        technicianId: l.technicianId,
        employeeId: l.employeeId,
        hoursWorked: Number(hoursDraft[lineKey(l)] ?? l.hoursWorked),
      }));
      const { payrollRun } = await api.patch<{ payrollRun: PayrollRun }>(`/payroll-runs/${run.id}`, { lines });
      setRuns((prev) => prev.map((r) => (r.id === run.id ? payrollRun : r)));
      toast.success('Hours updated');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update hours');
    } finally {
      setSavingHours(false);
    }
  };

  const downloadPayslip = (run: PayrollRun, line: PayrollRun['lines'][number]) => {
    downloadPayslipPdf({
      garageName: user?.garageName,
      technicianName: line.technicianName,
      periodStart: run.periodStart,
      periodEnd: run.periodEnd,
      hourlyRate: line.hourlyRate,
      hoursWorked: line.hoursWorked,
      grossPay: line.grossPay,
    });
  };

  return (
    <div>
      <PageHeader
        title="Payroll"
        description="Generate technician and employee pay from real attendance hours."
        action={<Button onClick={openGenerate}><PlusIcon className="h-4 w-4" /> Generate payroll run</Button>} />


      {loading ?
      <Card><div className="space-y-3 p-5">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div></Card> :
      runs.length === 0 ?
      <Card><EmptyState icon={BanknoteIcon} title="No payroll runs yet" description="Generate a run to compute pay from real clocked hours." /></Card> :

      <div className="space-y-3">
          {runs.map((run) =>
        <Card key={run.id}>
              <button type="button" onClick={() => toggleExpand(run)} className="flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-navy dark:text-slate-100">{formatDate(run.periodStart)} – {formatDate(run.periodEnd)}</p>
                    <StatusBadge status={run.status} />
                  </div>
                  <p className="mt-1 text-xs text-text-gray dark:text-slate-400">{run.lines.length} {run.lines.length === 1 ? 'person' : 'people'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="teal">{formatCurrency(run.totalAmount)}</Badge>
                  {expandedId === run.id ? <ChevronUpIcon className="h-4 w-4 text-text-gray" /> : <ChevronDownIcon className="h-4 w-4 text-text-gray" />}
                </div>
              </button>

              {expandedId === run.id &&
          <div className="border-t border-border-soft p-4 dark:border-slate-800">
                  <div className="space-y-2">
                    {run.lines.map((line) =>
              <div key={lineKey(line)} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-soft-gray p-3 dark:bg-slate-800/60">
                        <div className="min-w-0">
                          <p className="font-semibold text-navy dark:text-slate-100">
                            {line.technicianName}
                            <Badge tone={line.technicianId ? 'blue' : 'purple'} className="ml-1.5 align-middle">{line.technicianId ? 'Technician' : 'Employee'}</Badge>
                          </p>
                          <p className="text-xs text-text-gray dark:text-slate-400">
                            {line.hourlyRate != null ? `${formatCurrency(line.hourlyRate)}/hr` : 'No hourly rate set'}
                          </p>
                        </div>
                        {line.missingRate &&
                  <span className="flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
                            <AlertTriangleIcon className="h-3.5 w-3.5" /> Set an hourly rate under {line.technicianId ? 'Technicians' : 'Employees'}
                          </span>
                  }
                        <div className="flex items-center gap-3">
                          {run.status === 'Draft' ?
                    <Input
                      type="number"
                      min={0}
                      className="w-24"
                      value={hoursDraft[lineKey(line)] ?? String(line.hoursWorked)}
                      onChange={(e) => setHoursDraft((prev) => ({ ...prev, [lineKey(line)]: e.target.value }))} /> :

                    <span className="text-sm text-text-gray dark:text-slate-400">{line.hoursWorked} hrs</span>
                    }
                          <Badge tone="green">{formatCurrency(line.grossPay)}</Badge>
                          <Button size="sm" variant="ghost" onClick={() => downloadPayslip(run, line)}><DownloadIcon className="h-3.5 w-3.5" /></Button>
                        </div>
                      </div>
              )}
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {run.status === 'Draft' &&
              <>
                        <Button size="sm" variant="secondary" loading={savingHours} onClick={() => saveHourCorrections(run)}>Save hour corrections</Button>
                        <Button size="sm" loading={actingId === run.id} onClick={() => finalize(run)}>Finalize</Button>
                      </>
              }
                    {run.status === 'Finalized' &&
              <Button size="sm" loading={actingId === run.id} onClick={() => markPaid(run)}>Mark as paid</Button>
              }
                  </div>
                </div>
          }
            </Card>
        )}
        </div>
      }

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Generate payroll run"
        footer={
        <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={generate} loading={generating}>Generate</Button>
          </>
        }>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="pr-start">Period start</Label>
            <Input id="pr-start" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="pr-end">Period end</Label>
            <Input id="pr-end" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </div>
        </div>
        <p className="mt-3 text-xs text-text-gray dark:text-slate-400">
          Pulls real clocked hours from Attendance for every active technician and employee in this range, multiplied by their hourly rate.
        </p>
      </Modal>
    </div>);

}

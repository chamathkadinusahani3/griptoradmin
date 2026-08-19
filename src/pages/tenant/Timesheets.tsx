import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ClockIcon, PlusIcon, CheckIcon, XIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Label, Textarea } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { Timesheet } from '../../types/timesheet';
import { Technician } from '../../types/technician';
import { Employee } from '../../types/employee';
import { formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';
import { useHasPermission } from '../../context/AuthContext';

const STATUS_TONE: Record<Timesheet['status'], 'amber' | 'green' | 'red'> = { Submitted: 'amber', Approved: 'green', Rejected: 'red' };

export function Timesheets() {
  const canApprove = useHasPermission('approvals:respond');
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [subjectKey, setSubjectKey] = useState(''); // "technician:<id>" or "employee:<id>"
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const [rejectTarget, setRejectTarget] = useState<Timesheet | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [reviewing, setReviewing] = useState(false);

  const loadTimesheets = () => {
    setLoading(true);
    api
      .get<{ timesheets: Timesheet[] }>('/timesheets')
      .then(({ timesheets }) => setTimesheets(timesheets))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load timesheets'))
      .finally(() => setLoading(false));
  };

  useEffect(loadTimesheets, []);
  useEffect(() => {
    api.get<{ technicians: Technician[] }>('/technicians').then(({ technicians }) => setTechnicians(technicians)).catch(() => setTechnicians([]));
    api.get<{ employees: Employee[] }>('/employees').then(({ employees }) => setEmployees(employees.filter((e) => e.hasProfile))).catch(() => setEmployees([]));
  }, []);

  const openCreate = () => {
    setSubjectKey('');
    setPeriodStart('');
    setPeriodEnd('');
    setNotes('');
    setModalOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const [subjectType, subjectId] = subjectKey.split(':');
    if (!subjectType || !subjectId || !periodStart || !periodEnd) {
      toast.error('A person and both period dates are required');
      return;
    }
    setSaving(true);
    try {
      const { timesheet } = await api.post<{ timesheet: Timesheet }>('/timesheets', {
        subjectType,
        subjectId,
        periodStart,
        periodEnd,
        notes: notes || undefined,
      });
      setTimesheets((prev) => [timesheet, ...prev]);
      toast.success(`Timesheet submitted — ${timesheet.totalHours} hours`);
      setModalOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to submit timesheet');
    } finally {
      setSaving(false);
    }
  };

  const approve = async (t: Timesheet) => {
    setReviewing(true);
    try {
      const { timesheet } = await api.patch<{ timesheet: Timesheet }>(`/timesheets/${t.id}`, { action: 'approve' });
      setTimesheets((prev) => prev.map((x) => (x.id === timesheet.id ? timesheet : x)));
      toast.success('Timesheet approved');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to approve timesheet');
    } finally {
      setReviewing(false);
    }
  };

  const reject = async () => {
    if (!rejectTarget || !rejectionReason.trim()) {
      toast.error('A rejection reason is required');
      return;
    }
    setReviewing(true);
    try {
      const { timesheet } = await api.patch<{ timesheet: Timesheet }>(`/timesheets/${rejectTarget.id}`, { action: 'reject', rejectionReason });
      setTimesheets((prev) => prev.map((x) => (x.id === timesheet.id ? timesheet : x)));
      toast.success('Timesheet rejected');
      setRejectTarget(null);
      setRejectionReason('');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to reject timesheet');
    } finally {
      setReviewing(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Timesheets"
        description="Submit a period's clocked hours for approval — rolled up from real Attendance records."
        action={<Button onClick={openCreate} disabled={technicians.length === 0 && employees.length === 0}><PlusIcon className="h-4 w-4" /> Submit timesheet</Button>} />


      {loading ?
      <Card><div className="p-5"><TableSkeleton rows={6} /></div></Card> :
      timesheets.length === 0 ?
      <Card><EmptyState icon={ClockIcon} title="No timesheets yet" description="Submit a period to have a Manager approve the hours before payroll." /></Card> :

      <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead>
                <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                  <th className="px-5 py-3 font-bold">Person</th>
                  <th className="px-5 py-3 font-bold">Period</th>
                  <th className="px-5 py-3 text-right font-bold">Hours</th>
                  <th className="px-5 py-3 font-bold">Status</th>
                  <th className="px-5 py-3 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {timesheets.map((t) =>
              <tr key={t.id} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                    <td className="px-5 py-3 font-semibold text-navy dark:text-slate-100">{t.subjectName}</td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">{formatDate(t.periodStart)} – {formatDate(t.periodEnd)}</td>
                    <td className="px-5 py-3 text-right text-navy dark:text-slate-100">{t.totalHours}</td>
                    <td className="px-5 py-3">
                      <Badge tone={STATUS_TONE[t.status]}>{t.status}</Badge>
                      {t.status === 'Rejected' && t.rejectionReason && <p className="mt-1 text-xs text-text-gray dark:text-slate-400">{t.rejectionReason}</p>}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {t.status === 'Submitted' && canApprove &&
                  <div className="flex justify-end gap-1.5">
                          <Button size="sm" variant="secondary" onClick={() => approve(t)} loading={reviewing}><CheckIcon className="h-3.5 w-3.5" /> Approve</Button>
                          <Button size="sm" variant="secondary" onClick={() => setRejectTarget(t)}><XIcon className="h-3.5 w-3.5" /> Reject</Button>
                        </div>
                  }
                    </td>
                  </tr>
              )}
              </tbody>
            </table>
          </div>
        </Card>
      }

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Submit timesheet"
        footer={
        <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button form="timesheet-form" type="submit" loading={saving}>Submit</Button>
          </>
        }>
        <form id="timesheet-form" onSubmit={save} className="space-y-4">
          <div>
            <Label htmlFor="ts-subject">Person</Label>
            <Select id="ts-subject" value={subjectKey} onChange={(e) => setSubjectKey(e.target.value)}>
              <option value="">— select a person —</option>
              {technicians.length > 0 &&
              <optgroup label="Technicians">
                  {technicians.map((t) => <option key={t.id} value={`technician:${t.id}`}>{t.name}</option>)}
                </optgroup>
            }
              {employees.length > 0 &&
              <optgroup label="Employees">
                  {employees.map((e) => <option key={e.employeeId} value={`employee:${e.employeeId}`}>{e.name}</option>)}
                </optgroup>
            }
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="ts-start">Period start</Label>
              <Input id="ts-start" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="ts-end">Period end</Label>
              <Input id="ts-end" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="ts-notes">Notes (optional)</Label>
            <Textarea id="ts-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </form>
      </Modal>

      <Modal
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        title={rejectTarget ? `Reject ${rejectTarget.subjectName}'s timesheet` : 'Reject timesheet'}
        footer={
        <>
            <Button variant="secondary" onClick={() => setRejectTarget(null)}>Cancel</Button>
            <Button onClick={reject} loading={reviewing}>Reject</Button>
          </>
        }>
        <div>
          <Label htmlFor="ts-reject-reason">Reason</Label>
          <Textarea id="ts-reject-reason" required value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} />
        </div>
      </Modal>
    </div>);

}

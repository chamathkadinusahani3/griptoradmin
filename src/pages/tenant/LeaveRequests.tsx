import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CalendarClockIcon, PlusIcon, CheckIcon, XIcon, BanIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { StatCard } from '../../components/ui/StatCard';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Textarea, Label } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { LeaveRequest, LeaveType, LeaveStatus, LEAVE_TYPES } from '../../types/leaveRequest';
import { formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';
import { useAuth, useHasPermission } from '../../context/AuthContext';

const STATUS_TONE: Record<LeaveStatus, 'amber' | 'green' | 'red' | 'gray'> = {
  Pending: 'amber',
  Approved: 'green',
  Rejected: 'red',
  Cancelled: 'gray',
};
const emptyForm = { type: 'Annual' as LeaveType, startDate: '', endDate: '', reason: '' };

function daysBetween(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(1, Math.round(ms / 86400000) + 1);
}

export function LeaveRequests() {
  const { user } = useAuth();
  // Server-enforced (hasPermission inside leave-requests/[id].ts) — this is
  // UX only, matching Approvals.tsx's own canRespond convention.
  const canRespond = useHasPermission('leave-requests:respond');
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  const loadLeaveRequests = () => {
    api
      .get<{ leaveRequests: LeaveRequest[] }>('/leave-requests')
      .then(({ leaveRequests }) => setLeaveRequests(leaveRequests))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load leave requests'));
  };

  useEffect(loadLeaveRequests, []);

  const pending = leaveRequests.filter((l) => l.status === 'Pending').length;
  // Live-computed, not a stored balance/allowance — this app doesn't have
  // an accrual policy (deliberately out of scope), just a count of what's
  // actually been approved so far this year.
  const approvedDaysThisYear = leaveRequests
    .filter((l) => l.status === 'Approved' && new Date(l.startDate).getFullYear() === new Date().getFullYear())
    .reduce((sum, l) => sum + daysBetween(l.startDate, l.endDate), 0);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.startDate || !form.endDate) {
      toast.error('Start and end date are required');
      return;
    }
    setSaving(true);
    try {
      await api.post('/leave-requests', form);
      toast.success('Leave request submitted');
      setAddOpen(false);
      setForm(emptyForm);
      loadLeaveRequests();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to submit request');
    } finally {
      setSaving(false);
    }
  };

  const respond = async (leave: LeaveRequest, status: 'Approved' | 'Rejected' | 'Cancelled') => {
    setActingId(leave.id);
    try {
      const { leaveRequest: updated } = await api.patch<{ leaveRequest: LeaveRequest }>(`/leave-requests/${leave.id}`, { status });
      setLeaveRequests((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update request');
    } finally {
      setActingId(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Leave Requests"
        description="Time-off requests and approvals."
        action={<Button onClick={() => setAddOpen(true)}><PlusIcon className="h-4 w-4" /> Request leave</Button>} />


      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Pending" value={String(pending)} icon={CalendarClockIcon} hint="awaiting response" />
        <StatCard label="Approved days this year" value={String(approvedDaysThisYear)} icon={CheckIcon} hint="across all staff" />
      </div>

      <Card>
        {leaveRequests.length === 0 ?
        <EmptyState icon={CalendarClockIcon} title="No leave requests yet" description="Request time off to get started." /> :

        <ul className="divide-y divide-border-soft dark:divide-slate-800">
            {leaveRequests.map((l) =>
          <li key={l.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-navy dark:text-slate-100">
                    {l.type} — {daysBetween(l.startDate, l.endDate)} day{daysBetween(l.startDate, l.endDate) === 1 ? '' : 's'}
                  </p>
                  <p className="text-xs text-text-gray dark:text-slate-400">
                    {formatDate(l.startDate)} – {formatDate(l.endDate)} · Requested by {l.requestedByName ?? 'Unknown'}
                    {l.reason && ` · ${l.reason}`}
                    {l.respondedByName && ` · ${l.status} by ${l.respondedByName}`}
                  </p>
                </div>
                <Badge tone={STATUS_TONE[l.status]}>{l.status}</Badge>
                {l.status === 'Pending' &&
            <div className="flex gap-2">
                    {canRespond &&
              <>
                        <Button size="sm" variant="secondary" loading={actingId === l.id} onClick={() => respond(l, 'Approved')}><CheckIcon className="h-3.5 w-3.5" /> Approve</Button>
                        <Button size="sm" variant="secondary" loading={actingId === l.id} onClick={() => respond(l, 'Rejected')}><XIcon className="h-3.5 w-3.5" /> Reject</Button>
                      </>
              }
                    {l.requestedBy === user?.id &&
              <Button size="sm" variant="ghost" loading={actingId === l.id} onClick={() => respond(l, 'Cancelled')}><BanIcon className="h-3.5 w-3.5" /> Cancel</Button>
              }
                  </div>
            }
              </li>
          )}
          </ul>
        }
      </Card>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Request leave"
        footer={
        <>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button form="add-leave-form" type="submit" loading={saving}>Submit</Button>
          </>
        }>
        <form id="add-leave-form" onSubmit={handleAdd} className="space-y-4">
          <div>
            <Label htmlFor="lv-type">Type</Label>
            <Select id="lv-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as LeaveType })}>
              {LEAVE_TYPES.map((t) => <option key={t}>{t}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="lv-start">Start date</Label>
              <Input id="lv-start" type="date" required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="lv-end">End date</Label>
              <Input id="lv-end" type="date" required value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </div>
          </div>
          <div>
            <Label htmlFor="lv-reason">Reason (optional)</Label>
            <Textarea id="lv-reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </div>
        </form>
      </Modal>
    </div>);

}

import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PhoneIcon, PhoneIncomingIcon, PhoneOutgoingIcon, PlusIcon, ClockIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { StatCard } from '../../components/ui/StatCard';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Textarea, Label } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { CallLog, CallDirection, CallStatus } from '../../types/callLog';
import { Customer } from '../../types/customer';
import { formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

const STATUS_TONE: Record<CallStatus, 'blue' | 'green' | 'red'> = {
  Open: 'blue',
  Resolved: 'green',
  Escalated: 'red',
};

const emptyForm = { customerId: '', direction: 'Outbound' as CallDirection, reason: '', durationMinutes: '', notes: '', followUpDue: '' };

export function CallLogs() {
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const loadCalls = () => {
    api
      .get<{ callLogs: CallLog[] }>('/call-logs')
      .then(({ callLogs }) => setCalls(callLogs))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load call logs'));
  };

  useEffect(loadCalls, []);
  useEffect(() => {
    api.get<{ customers: Customer[] }>('/customers').then(({ customers }) => setCustomers(customers)).catch(() => setCustomers([]));
  }, []);

  const open = calls.filter((c) => c.status === 'Open').length;
  const escalated = calls.filter((c) => c.status === 'Escalated').length;
  const withFollowUp = calls.filter((c) => c.followUpDue).length;

  const openCreate = () => {
    setForm({ ...emptyForm, customerId: customers[0]?.id ?? '' });
    setAddOpen(true);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/call-logs', {
        ...form,
        durationMinutes: form.durationMinutes ? Number(form.durationMinutes) : undefined,
        followUpDue: form.followUpDue || undefined,
      });
      toast.success('Call logged');
      setAddOpen(false);
      loadCalls();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to log call');
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (call: CallLog, status: CallStatus) => {
    const previous = calls;
    setCalls((prev) => prev.map((c) => c.id === call.id ? { ...c, status } : c));
    try {
      await api.patch(`/call-logs/${call.id}`, { status });
    } catch (err) {
      setCalls(previous);
      toast.error(err instanceof ApiError ? err.message : 'Failed to update call log');
    }
  };

  return (
    <div>
      <PageHeader
        title="Call Logs"
        description="Track customer calls and follow-ups."
        action={<Button onClick={openCreate} disabled={customers.length === 0} title={customers.length === 0 ? 'Add a customer first' : undefined}><PlusIcon className="h-4 w-4" /> Log call</Button>} />


      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Open" value={String(open)} icon={PhoneIcon} hint="needs attention" />
        <StatCard label="Escalated" value={String(escalated)} icon={PhoneIcon} hint="high priority" />
        <StatCard label="With follow-up" value={String(withFollowUp)} icon={ClockIcon} hint="reminder scheduled" />
      </div>

      <Card>
        {calls.length === 0 ?
        <EmptyState icon={PhoneIcon} title="No calls logged yet" description="Log your first customer call." /> :

        <ul className="divide-y divide-border-soft dark:divide-slate-800">
            {calls.map((c) => {
            const DirIcon = c.direction === 'Inbound' ? PhoneIncomingIcon : PhoneOutgoingIcon;
            return (
              <li key={c.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-light-blue text-teal dark:bg-teal/15">
                    <DirIcon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-navy dark:text-slate-100">{c.reason}</p>
                    <p className="text-xs text-text-gray dark:text-slate-400">
                      {c.customer} · {formatDate(c.createdAt)}{c.durationMinutes ? ` · ${c.durationMinutes} min` : ''}
                      {c.followUpDue ? ` · Follow-up ${formatDate(c.followUpDue)}` : ''}
                    </p>
                  </div>
                  <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
                  {c.status !== 'Resolved' &&
                <Button size="sm" variant="secondary" onClick={() => setStatus(c, 'Resolved')}>Resolve</Button>
                }
                  {c.status === 'Open' &&
                <Button size="sm" variant="secondary" onClick={() => setStatus(c, 'Escalated')}>Escalate</Button>
                }
                </li>);

          })}
          </ul>
        }
      </Card>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Log call"
        footer={
        <>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button form="add-call-form" type="submit" loading={saving}>Log call</Button>
          </>
        }>
        <form id="add-call-form" onSubmit={handleAdd} className="space-y-4">
          <div>
            <Label htmlFor="cl-customer">Customer</Label>
            <Select id="cl-customer" value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="cl-direction">Direction</Label>
            <Select id="cl-direction" value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value as CallDirection })}>
              <option value="Outbound">Outbound</option>
              <option value="Inbound">Inbound</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="cl-reason">Reason</Label>
            <Input id="cl-reason" required value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Follow-up on quote" />
          </div>
          <div>
            <Label htmlFor="cl-duration">Duration (minutes, optional)</Label>
            <Input id="cl-duration" type="number" min={0} value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="cl-followup">Follow-up due (optional)</Label>
            <Input id="cl-followup" type="date" value={form.followUpDue} onChange={(e) => setForm({ ...form, followUpDue: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="cl-notes">Notes</Label>
            <Textarea id="cl-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="What was discussed…" />
          </div>
        </form>
      </Modal>
    </div>);

}

import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CalendarClockIcon, PlusIcon, CheckIcon, XIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Label, Textarea } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { Followup, FollowupType, FOLLOWUP_TYPES } from '../../types/followup';
import { Prospect } from '../../types/prospect';
import { Customer } from '../../types/customer';
import { TenantUser } from '../../types/tenantUser';
import { formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

const STATUS_TONE: Record<Followup['status'], 'amber' | 'green' | 'gray'> = { Pending: 'amber', Completed: 'green', Cancelled: 'gray' };

export function Followups() {
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [staff, setStaff] = useState<TenantUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [subjectKey, setSubjectKey] = useState(''); // "customer:<id>" or "prospect:<id>"
  const [dueDate, setDueDate] = useState('');
  const [type, setType] = useState<FollowupType>('Call');
  const [assignedTo, setAssignedTo] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  const loadFollowups = () => {
    setLoading(true);
    api
      .get<{ followups: Followup[] }>('/followups')
      .then(({ followups }) => setFollowups(followups))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load follow-ups'))
      .finally(() => setLoading(false));
  };

  useEffect(loadFollowups, []);
  useEffect(() => {
    api.get<{ customers: Customer[] }>('/customers').then(({ customers }) => setCustomers(customers)).catch(() => setCustomers([]));
    api.get<{ prospects: Prospect[] }>('/prospects').then(({ prospects }) => setProspects(prospects.filter((p) => p.status !== 'Converted' && p.status !== 'Lost'))).catch(() => setProspects([]));
    api.get<{ staff: TenantUser[] }>('/staff').then(({ staff }) => setStaff(staff)).catch(() => setStaff([]));
  }, []);

  const openCreate = () => {
    setSubjectKey('');
    setDueDate('');
    setType('Call');
    setAssignedTo('');
    setNotes('');
    setModalOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const [subjectType, subjectId] = subjectKey.split(':');
    if (!subjectType || !subjectId || !dueDate) {
      toast.error('A subject and due date are required');
      return;
    }
    setSaving(true);
    try {
      const { followup } = await api.post<{ followup: Followup }>('/followups', {
        customerId: subjectType === 'customer' ? subjectId : undefined,
        prospectId: subjectType === 'prospect' ? subjectId : undefined,
        dueDate,
        type,
        assignedTo: assignedTo || undefined,
        notes: notes || undefined,
      });
      setFollowups((prev) => [followup, ...prev].sort((a, b) => a.dueDate.localeCompare(b.dueDate)));
      toast.success('Follow-up scheduled');
      setModalOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to schedule follow-up');
    } finally {
      setSaving(false);
    }
  };

  const respond = async (f: Followup, action: 'complete' | 'cancel') => {
    setActingId(f.id);
    try {
      const { followup } = await api.patch<{ followup: Followup }>(`/followups/${f.id}`, { action });
      setFollowups((prev) => prev.map((x) => (x.id === followup.id ? followup : x)));
      toast.success(action === 'complete' ? 'Follow-up completed' : 'Follow-up cancelled');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update follow-up');
    } finally {
      setActingId(null);
    }
  };

  const filtered = followups.filter((f) => showCompleted || f.status === 'Pending');

  return (
    <div>
      <PageHeader
        title="Follow-ups"
        description="Scheduled outreach tasks for a customer or prospect, with a real owner and due date."
        action={<Button onClick={openCreate} disabled={customers.length === 0 && prospects.length === 0}><PlusIcon className="h-4 w-4" /> Schedule follow-up</Button>} />


      <div className="mb-4">
        <button
          onClick={() => setShowCompleted((v) => !v)}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${showCompleted ? 'bg-griptor-gradient text-white' : 'bg-soft-gray text-text-gray hover:bg-light-blue dark:bg-slate-800 dark:text-slate-300'}`}>

          {showCompleted ? 'Showing all' : 'Pending only'}
        </button>
      </div>

      {loading ?
      <Card><div className="p-5"><TableSkeleton rows={6} /></div></Card> :
      filtered.length === 0 ?
      <Card><EmptyState icon={CalendarClockIcon} title="No follow-ups" description="Schedule one for a customer or prospect." /></Card> :

      <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead>
                <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                  <th className="px-5 py-3 font-bold">Subject</th>
                  <th className="px-5 py-3 font-bold">Type</th>
                  <th className="px-5 py-3 font-bold">Due</th>
                  <th className="px-5 py-3 font-bold">Assigned to</th>
                  <th className="px-5 py-3 font-bold">Status</th>
                  <th className="px-5 py-3 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((f) =>
              <tr key={f.id} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                    <td className="px-5 py-3 font-semibold text-navy dark:text-slate-100">
                      {f.subjectName}
                      <Badge tone={f.customerId ? 'blue' : 'purple'} className="ml-1.5 align-middle">{f.customerId ? 'Customer' : 'Prospect'}</Badge>
                    </td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">{f.type}</td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">{formatDate(f.dueDate)}</td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">{f.assignedToName ?? '—'}</td>
                    <td className="px-5 py-3"><Badge tone={STATUS_TONE[f.status]}>{f.status}</Badge></td>
                    <td className="px-5 py-3 text-right">
                      {f.status === 'Pending' &&
                  <div className="flex justify-end gap-1.5">
                          <Button size="sm" variant="secondary" onClick={() => respond(f, 'complete')} loading={actingId === f.id}><CheckIcon className="h-3.5 w-3.5" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => respond(f, 'cancel')} loading={actingId === f.id}><XIcon className="h-3.5 w-3.5" /></Button>
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
        title="Schedule follow-up"
        footer={
        <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button form="followup-form" type="submit" loading={saving}>Schedule</Button>
          </>
        }>
        <form id="followup-form" onSubmit={save} className="space-y-4">
          <div>
            <Label htmlFor="fu-subject">Subject</Label>
            <Select id="fu-subject" value={subjectKey} onChange={(e) => setSubjectKey(e.target.value)}>
              <option value="">— select a customer or prospect —</option>
              {customers.length > 0 &&
              <optgroup label="Customers">
                  {customers.map((c) => <option key={c.id} value={`customer:${c.id}`}>{c.name}</option>)}
                </optgroup>
            }
              {prospects.length > 0 &&
              <optgroup label="Prospects">
                  {prospects.map((p) => <option key={p.id} value={`prospect:${p.id}`}>{p.name}</option>)}
                </optgroup>
            }
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="fu-due">Due date</Label>
              <Input id="fu-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="fu-type">Type</Label>
              <Select id="fu-type" value={type} onChange={(e) => setType(e.target.value as FollowupType)}>
                {FOLLOWUP_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            </div>
          </div>
          {staff.length > 0 &&
          <div>
              <Label htmlFor="fu-assignee">Assign to (optional)</Label>
              <Select id="fu-assignee" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
                <option value="">— unassigned —</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </div>
          }
          <div>
            <Label htmlFor="fu-notes">Notes (optional)</Label>
            <Textarea id="fu-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </form>
      </Modal>
    </div>);

}

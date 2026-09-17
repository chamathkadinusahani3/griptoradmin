import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ClipboardCheckIcon, PlusIcon, PhoneCallIcon, HandshakeIcon, CheckIcon, XIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Label, Textarea } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { CollectionTask, CollectionTaskStatus, COLLECTION_TASK_STATUSES } from '../../types/collectionTask';
import { TenantUser } from '../../types/tenantUser';
import { ArAgingReport } from '../../types/aging';
import { formatDate, formatCurrency } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

const STATUS_TONE: Record<CollectionTaskStatus, 'amber' | 'blue' | 'purple' | 'green' | 'red'> = {
  Pending: 'amber',
  Contacted: 'blue',
  'Promise to Pay': 'purple',
  Collected: 'green',
  Failed: 'red',
};

type ActionKind = 'promise' | 'collect' | 'fail';

export function CollectionTasks() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tasks, setTasks] = useState<CollectionTask[]>([]);
  const [staff, setStaff] = useState<TenantUser[]>([]);
  const [overdueCustomers, setOverdueCustomers] = useState<ArAgingReport['customers']>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'All' | CollectionTaskStatus>('All');

  const [modalOpen, setModalOpen] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  const [actionTarget, setActionTarget] = useState<{ task: CollectionTask; kind: ActionKind } | null>(null);
  const [promiseDate, setPromiseDate] = useState('');
  const [promiseAmount, setPromiseAmount] = useState('');
  const [collectedAmount, setCollectedAmount] = useState('');
  const [failReason, setFailReason] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);

  const loadTasks = () => {
    setLoading(true);
    api
      .get<{ collectionTasks: CollectionTask[] }>('/collection-tasks')
      .then(({ collectionTasks }) => setTasks(collectionTasks))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load collection tasks'))
      .finally(() => setLoading(false));
  };

  useEffect(loadTasks, []);
  useEffect(() => {
    api.get<{ staff: TenantUser[] }>('/staff').then(({ staff }) => setStaff(staff)).catch(() => setStaff([]));
    api.get<ArAgingReport>('/tenant/ar-aging').then((r) => setOverdueCustomers(r.customers)).catch(() => setOverdueCustomers([]));
  }, []);

  // Deep-link support from the AR Aging page's "Create task" button.
  useEffect(() => {
    const deepLinkCustomerId = searchParams.get('customerId');
    if (!deepLinkCustomerId) return;
    setCustomerId(deepLinkCustomerId);
    setAssignedTo('');
    setNotes('');
    setModalOpen(true);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('customerId');
      return next;
    }, { replace: true });
  }, [searchParams, setSearchParams]);

  const openCreate = () => {
    setCustomerId('');
    setAssignedTo('');
    setNotes('');
    setModalOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId || !assignedTo) {
      toast.error('A customer and an assignee are required');
      return;
    }
    setSaving(true);
    try {
      const { collectionTask } = await api.post<{ collectionTask: CollectionTask }>('/collection-tasks', {
        customerId, assignedTo, notes: notes || undefined,
      });
      setTasks((prev) => [collectionTask, ...prev]);
      toast.success('Collection task created');
      setModalOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to create collection task');
    } finally {
      setSaving(false);
    }
  };

  const markContacted = async (task: CollectionTask) => {
    setActingId(task.id);
    try {
      const { collectionTask } = await api.patch<{ collectionTask: CollectionTask }>(`/collection-tasks/${task.id}`, { action: 'contact' });
      setTasks((prev) => prev.map((t) => (t.id === collectionTask.id ? collectionTask : t)));
      toast.success('Marked as Contacted');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update task');
    } finally {
      setActingId(null);
    }
  };

  const openAction = (task: CollectionTask, kind: ActionKind) => {
    setPromiseDate('');
    setPromiseAmount('');
    setCollectedAmount('');
    setFailReason('');
    setActionTarget({ task, kind });
  };

  const submitAction = async () => {
    if (!actionTarget) return;
    const { task, kind } = actionTarget;
    if (kind === 'promise' && (!promiseDate || !promiseAmount || Number(promiseAmount) <= 0)) {
      toast.error('A promise date and a positive amount are required');
      return;
    }
    if (kind === 'collect' && (!collectedAmount || Number(collectedAmount) <= 0)) {
      toast.error('A positive collected amount is required');
      return;
    }
    setSubmittingAction(true);
    try {
      const body =
        kind === 'promise' ? { action: 'promise', promiseDate, promiseAmount: Number(promiseAmount) } :
        kind === 'collect' ? { action: 'collect', collectedAmount: Number(collectedAmount) } :
        { action: 'fail', failReason: failReason || undefined };
      const { collectionTask } = await api.patch<{ collectionTask: CollectionTask }>(`/collection-tasks/${task.id}`, body);
      setTasks((prev) => prev.map((t) => (t.id === collectionTask.id ? collectionTask : t)));
      toast.success(kind === 'promise' ? 'Promise to pay logged' : kind === 'collect' ? 'Marked as Collected' : 'Marked as Failed');
      setActionTarget(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update task');
    } finally {
      setSubmittingAction(false);
    }
  };

  const filtered = statusFilter === 'All' ? tasks : tasks.filter((t) => t.status === statusFilter);
  const noPrereqs = staff.length === 0;

  return (
    <div>
      <PageHeader
        title="Collection Tasks"
        description="Assign an overdue customer to a staff member and track the chase through to collection."
        action={<Button onClick={openCreate} disabled={noPrereqs} title={noPrereqs ? 'Add a staff member first' : undefined}><PlusIcon className="h-4 w-4" /> New task</Button>} />


      <div className="mb-4 flex flex-wrap gap-2">
        {(['All', ...COLLECTION_TASK_STATUSES] as const).map((s) =>
        <button
          key={s}
          onClick={() => setStatusFilter(s)}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${statusFilter === s ? 'bg-griptor-gradient text-white' : 'bg-soft-gray text-text-gray hover:bg-light-blue dark:bg-slate-800 dark:text-slate-300'}`}>

            {s}
          </button>
        )}
      </div>

      {loading ?
      <Card><div className="p-5"><TableSkeleton rows={6} /></div></Card> :
      filtered.length === 0 ?
      <Card><EmptyState icon={ClipboardCheckIcon} title="No collection tasks" description="Create one for an overdue customer to start tracking the chase." /></Card> :

      <Card>
          <ul className="divide-y divide-border-soft dark:divide-slate-800">
            {filtered.map((t) =>
          <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-navy dark:text-slate-100">{t.customerName}</p>
                    <Badge tone={STATUS_TONE[t.status]}>{t.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-text-gray dark:text-slate-400">
                    Outstanding at creation: {formatCurrency(t.outstandingAmountAtCreation)} · Assigned to {t.assignedToName ?? '—'}
                  </p>
                  {t.status === 'Promise to Pay' && t.promiseDate &&
              <p className="mt-1 text-xs text-text-gray dark:text-slate-400">Promised {formatCurrency(t.promiseAmount ?? 0)} by {formatDate(t.promiseDate)}</p>
              }
                  {t.status === 'Collected' &&
              <p className="mt-1 text-xs text-text-gray dark:text-slate-400">Collected {formatCurrency(t.collectedAmount ?? 0)}</p>
              }
                  {t.status === 'Failed' && t.failReason &&
              <p className="mt-1 text-xs text-text-gray dark:text-slate-400">{t.failReason}</p>
              }
                  {t.notes && <p className="mt-1 text-xs text-text-gray dark:text-slate-500">{t.notes}</p>}
                  <p className="mt-1 text-xs text-text-gray dark:text-slate-400">{formatDate(t.createdAt)}</p>
                </div>
                {(t.status === 'Pending' || t.status === 'Contacted' || t.status === 'Promise to Pay') &&
            <div className="flex flex-wrap items-center gap-2">
                    {t.status === 'Pending' &&
              <Button size="sm" variant="secondary" loading={actingId === t.id} onClick={() => markContacted(t)}><PhoneCallIcon className="h-3.5 w-3.5" /> Contacted</Button>
              }
                    <Button size="sm" variant="secondary" onClick={() => openAction(t, 'promise')}><HandshakeIcon className="h-3.5 w-3.5" /> Promise</Button>
                    <Button size="sm" onClick={() => openAction(t, 'collect')}><CheckIcon className="h-3.5 w-3.5" /> Collected</Button>
                    <Button size="sm" variant="ghost" onClick={() => openAction(t, 'fail')}><XIcon className="h-3.5 w-3.5" /> Failed</Button>
                  </div>
            }
              </li>
          )}
          </ul>
        </Card>
      }

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="New collection task"
        footer={
        <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button form="collection-task-form" type="submit" loading={saving}>Create task</Button>
          </>
        }>
        <form id="collection-task-form" onSubmit={save} className="space-y-4">
          <div>
            <Label htmlFor="ct-customer">Customer</Label>
            <Select id="ct-customer" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">— select an overdue customer —</option>
              {overdueCustomers.map((c) => <option key={c.id} value={c.id}>{c.name} — {formatCurrency(c.outstanding)} ({c.oldestBucket})</option>)}
            </Select>
            {overdueCustomers.length === 0 && <p className="mt-1 text-xs text-text-gray dark:text-slate-400">No customer currently has an outstanding balance.</p>}
          </div>
          <div>
            <Label htmlFor="ct-assignee">Assign to</Label>
            <Select id="ct-assignee" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
              <option value="">— select a staff member —</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="ct-notes">Notes (optional)</Label>
            <Textarea id="ct-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </form>
      </Modal>

      <Modal
        open={!!actionTarget}
        onClose={() => setActionTarget(null)}
        title={
        actionTarget?.kind === 'promise' ? 'Log promise to pay' :
        actionTarget?.kind === 'collect' ? 'Mark as Collected' :
        'Mark as Failed'
        }
        footer={
        <>
            <Button variant="secondary" onClick={() => setActionTarget(null)}>Cancel</Button>
            <Button onClick={submitAction} loading={submittingAction}>Save</Button>
          </>
        }>

        {actionTarget?.kind === 'promise' &&
        <div className="space-y-4">
            <div>
              <Label htmlFor="ct-promise-date">Promise date</Label>
              <Input id="ct-promise-date" type="date" value={promiseDate} onChange={(e) => setPromiseDate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="ct-promise-amount">Promised amount</Label>
              <Input id="ct-promise-amount" type="number" min={0} value={promiseAmount} onChange={(e) => setPromiseAmount(e.target.value)} />
            </div>
          </div>
        }
        {actionTarget?.kind === 'collect' &&
        <div>
            <Label htmlFor="ct-collected-amount">Collected amount</Label>
            <Input id="ct-collected-amount" type="number" min={0} value={collectedAmount} onChange={(e) => setCollectedAmount(e.target.value)} />
            <p className="mt-2 text-xs text-text-gray dark:text-slate-400">This only marks the task done — record the actual payment via Receipts or the invoice's own Payment action.</p>
          </div>
        }
        {actionTarget?.kind === 'fail' &&
        <div>
            <Label htmlFor="ct-fail-reason">Reason (optional)</Label>
            <Textarea id="ct-fail-reason" value={failReason} onChange={(e) => setFailReason(e.target.value)} />
          </div>
        }
      </Modal>
    </div>);

}

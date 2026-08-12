import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangleIcon, PlusIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { StatusBadge } from '../../components/StatusBadge';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Textarea, Label } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { Complaint, ComplaintDirection, ComplaintCategory, ComplaintPriority, ComplaintStatus } from '../../types/complaint';
import { Customer } from '../../types/customer';
import { Supplier } from '../../types/supplier';
import { formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

const STATUS_FILTERS: ('All' | ComplaintStatus)[] = ['All', 'Open', 'In Progress', 'Resolved', 'Closed'];
const CATEGORIES: ComplaintCategory[] = ['Quality', 'Service', 'Billing', 'Delivery', 'Communication', 'Other'];
const PRIORITIES: ComplaintPriority[] = ['Low', 'Medium', 'High', 'Urgent'];
const STATUSES: ComplaintStatus[] = ['Open', 'In Progress', 'Resolved', 'Closed'];
const PRIORITY_TONE: Record<ComplaintPriority, 'gray' | 'blue' | 'amber' | 'red'> = {
  Low: 'gray',
  Medium: 'blue',
  High: 'amber',
  Urgent: 'red',
};

const emptyForm = {
  direction: 'customer' as ComplaintDirection,
  customerId: '',
  supplierId: '',
  category: 'Quality' as ComplaintCategory,
  subject: '',
  description: '',
  priority: 'Medium' as ComplaintPriority,
};

export function Complaints() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'All' | ComplaintStatus>('All');

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [selected, setSelected] = useState<Complaint | null>(null);
  const [editStatus, setEditStatus] = useState<ComplaintStatus>('Open');
  const [editPriority, setEditPriority] = useState<ComplaintPriority>('Medium');
  const [editResolution, setEditResolution] = useState('');
  const [updating, setUpdating] = useState(false);

  const loadComplaints = () => {
    setLoading(true);
    api
      .get<{ complaints: Complaint[] }>('/complaints')
      .then(({ complaints }) => setComplaints(complaints))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load complaints'))
      .finally(() => setLoading(false));
  };

  useEffect(loadComplaints, []);

  useEffect(() => {
    api.get<{ customers: Customer[] }>('/customers').then(({ customers }) => setCustomers(customers)).catch(() => setCustomers([]));
    api.get<{ suppliers: Supplier[] }>('/suppliers').then(({ suppliers }) => setSuppliers(suppliers)).catch(() => setSuppliers([]));
  }, []);

  const openCreate = () => {
    setForm({ ...emptyForm, customerId: customers[0]?.id ?? '', supplierId: suppliers[0]?.id ?? '' });
    setModalOpen(true);
  };

  const save = async () => {
    if (form.direction === 'customer' && !form.customerId) {
      toast.error('Pick a customer');
      return;
    }
    if (form.direction === 'supplier' && !form.supplierId) {
      toast.error('Pick a supplier');
      return;
    }
    if (!form.subject.trim() || !form.description.trim()) {
      toast.error('Subject and description are required');
      return;
    }
    setSaving(true);
    try {
      const { complaint } = await api.post<{ complaint: Complaint }>('/complaints', {
        direction: form.direction,
        customerId: form.direction === 'customer' ? form.customerId : undefined,
        supplierId: form.direction === 'supplier' ? form.supplierId : undefined,
        category: form.category,
        subject: form.subject.trim(),
        description: form.description.trim(),
        priority: form.priority,
      });
      setComplaints((prev) => [complaint, ...prev]);
      toast.success(`${complaint.complaintNumber} logged`);
      setModalOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to log complaint');
    } finally {
      setSaving(false);
    }
  };

  const openDetail = (c: Complaint) => {
    setSelected(c);
    setEditStatus(c.status);
    setEditPriority(c.priority);
    setEditResolution(c.resolution ?? '');
  };

  const saveDetail = async () => {
    if (!selected) return;
    setUpdating(true);
    try {
      const { complaint } = await api.patch<{ complaint: Complaint }>(`/complaints/${selected.id}`, {
        status: editStatus,
        priority: editPriority,
        resolution: editResolution || undefined,
      });
      setComplaints((prev) => prev.map((c) => (c.id === complaint.id ? complaint : c)));
      toast.success('Complaint updated');
      setSelected(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update complaint');
    } finally {
      setUpdating(false);
    }
  };

  const filtered = statusFilter === 'All' ? complaints : complaints.filter((c) => c.status === statusFilter);
  const noPrereqs = customers.length === 0 && suppliers.length === 0;

  return (
    <div>
      <PageHeader
        title="Complaints"
        description="Track issues raised by customers or with suppliers through to resolution."
        action={
        <Button onClick={openCreate} disabled={noPrereqs} title={noPrereqs ? 'Add a customer or supplier first' : undefined}>
            <PlusIcon className="h-4 w-4" /> New complaint
          </Button>
        } />


      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((s) =>
        <button
          key={s}
          onClick={() => setStatusFilter(s)}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${statusFilter === s ? 'bg-griptor-gradient text-white' : 'bg-soft-gray text-text-gray hover:bg-light-blue dark:bg-slate-800 dark:text-slate-300'}`}>

            {s}
          </button>
        )}
      </div>

      {loading ?
      <Card><div className="p-5"><TableSkeleton rows={5} /></div></Card> :
      filtered.length === 0 ?
      <Card><EmptyState icon={AlertTriangleIcon} title="No complaints" description="Log a customer or supplier complaint to start tracking it." /></Card> :

      <Card>
          <ul className="divide-y divide-border-soft dark:divide-slate-800">
            {filtered.map((c) =>
          <li key={c.id} onClick={() => openDetail(c)} className="cursor-pointer p-4 transition hover:bg-soft-gray dark:hover:bg-slate-800/50">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-navy dark:text-slate-100">{c.complaintNumber}</p>
                      <Badge tone={c.direction === 'customer' ? 'amber' : 'blue'}>{c.direction === 'customer' ? 'Customer' : 'Supplier'}</Badge>
                      <StatusBadge status={c.status} />
                      <Badge tone={PRIORITY_TONE[c.priority]}>{c.priority}</Badge>
                    </div>
                    <p className="mt-1 text-sm font-semibold text-navy dark:text-slate-200">{c.subject}</p>
                    <p className="mt-1 text-xs text-text-gray dark:text-slate-400">{c.party ?? 'Unknown'} · {c.category} · {formatDate(c.createdAt)}</p>
                  </div>
                </div>
              </li>
          )}
          </ul>
        </Card>
      }

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="New complaint"
        footer={
        <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={save} loading={saving}>Log complaint</Button>
          </>
        }>

        <div className="space-y-4">
          <div>
            <Label htmlFor="cmp-direction">Direction</Label>
            <Select id="cmp-direction" value={form.direction} onChange={(e) => setForm((f) => ({ ...f, direction: e.target.value as ComplaintDirection }))}>
              <option value="customer">From a customer</option>
              <option value="supplier">About a supplier</option>
            </Select>
          </div>
          {form.direction === 'customer' ?
          <div>
              <Label htmlFor="cmp-customer">Customer</Label>
              <Select id="cmp-customer" value={form.customerId} onChange={(e) => setForm((f) => ({ ...f, customerId: e.target.value }))}>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div> :

          <div>
              <Label htmlFor="cmp-supplier">Supplier</Label>
              <Select id="cmp-supplier" value={form.supplierId} onChange={(e) => setForm((f) => ({ ...f, supplierId: e.target.value }))}>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </div>
          }
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="cmp-category">Category</Label>
              <Select id="cmp-category" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as ComplaintCategory }))}>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="cmp-priority">Priority</Label>
              <Select id="cmp-priority" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as ComplaintPriority }))}>
                {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="cmp-subject">Subject</Label>
            <Input id="cmp-subject" value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} placeholder="Short summary" />
          </div>
          <div>
            <Label htmlFor="cmp-description">Description</Label>
            <Textarea id="cmp-description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </div>
        </div>
      </Modal>

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `${selected.complaintNumber} — ${selected.subject}` : ''}
        footer={
        <>
            <Button variant="secondary" onClick={() => setSelected(null)}>Cancel</Button>
            <Button onClick={saveDetail} loading={updating}>Save</Button>
          </>
        }>

        {selected &&
        <div className="space-y-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                {selected.direction === 'customer' ? 'Customer' : 'Supplier'} · {selected.category}
              </p>
              <p className="mt-1 text-sm font-semibold text-navy dark:text-slate-100">{selected.party ?? 'Unknown'}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-text-gray dark:text-slate-400">{selected.description}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-status">Status</Label>
                <Select id="edit-status" value={editStatus} onChange={(e) => setEditStatus(e.target.value as ComplaintStatus)}>
                  {STATUSES.map((s) => <option key={s}>{s}</option>)}
                </Select>
              </div>
              <div>
                <Label htmlFor="edit-priority">Priority</Label>
                <Select id="edit-priority" value={editPriority} onChange={(e) => setEditPriority(e.target.value as ComplaintPriority)}>
                  {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="edit-resolution">Resolution (optional)</Label>
              <Textarea id="edit-resolution" value={editResolution} onChange={(e) => setEditResolution(e.target.value)} placeholder="How was this resolved?" />
            </div>
            {selected.resolvedAt && <p className="text-xs text-text-gray dark:text-slate-400">Resolved {formatDate(selected.resolvedAt)}</p>}
          </div>
        }
      </Modal>
    </div>);

}

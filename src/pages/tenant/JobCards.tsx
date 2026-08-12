import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { PlusIcon, XIcon, CarIcon, UserIcon, ChevronRightIcon, ChevronLeftIcon, ReceiptIcon, WrenchIcon, LayoutGridIcon, ListIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { StatusBadge } from '../../components/StatusBadge';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Textarea, Label } from '../../components/ui/Input';
import { JobCard, JobStatus, ChecklistItem } from '../../types/jobCard';
import { Customer } from '../../types/customer';
import { Technician } from '../../types/technician';
import { Bay } from '../../types/bay';
import { Vehicle } from '../../types/vehicle';
import { Branch } from '../../types/branch';
import { Part } from '../../types/part';
import { CustomerInvoice } from '../../types/customerInvoice';
import { formatCurrency, cn } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

const STATUSES: {key: JobStatus;accent: string;}[] = [
{ key: 'New', accent: 'border-t-royal' },
{ key: 'In Progress', accent: 'border-t-bright-blue' },
{ key: 'Awaiting Parts', accent: 'border-t-amber-400' },
{ key: 'Completed', accent: 'border-t-emerald-500' }];


const ORDER: JobStatus[] = ['New', 'In Progress', 'Awaiting Parts', 'Completed'];

const emptyForm = {
  customerId: '', vehicle: '', plate: '', vehicleId: '', service: '', technicianId: '', estimate: '', status: 'New' as JobStatus, bayId: '',
  checklist: [] as ChecklistItem[], laborCost: '0'
};

function actualCost(job: Pick<JobCard, 'partsUsed' | 'laborCost'>): number {
  return job.partsUsed.reduce((sum, p) => sum + p.price * p.qty, 0) + job.laborCost;
}

export function JobCards() {
  const [jobs, setJobs] = useState<JobCard[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [bays, setBays] = useState<Bay[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<JobCard | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [customerVehicles, setCustomerVehicles] = useState<Vehicle[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchFilter, setBranchFilter] = useState('');
  const [parts, setParts] = useState<Part[]>([]);
  const [newChecklistText, setNewChecklistText] = useState('');
  const [addPartId, setAddPartId] = useState('');
  const [addPartQty, setAddPartQty] = useState('1');
  const [addingPart, setAddingPart] = useState(false);
  const [generatingInvoice, setGeneratingInvoice] = useState(false);
  // customers/technicians both start as [] before their fetch resolves, so
  // "0 customers" and "still loading" are indistinguishable by array length
  // alone — without this, the "you need a customer/technician" warning (and
  // disabled New job card button) flashes on every load even when the
  // tenant already has both, until the fetch finishes.
  const [prereqsLoading, setPrereqsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board');

  const loadJobs = () => {
    api
      .get<{ jobCards: JobCard[] }>(`/job-cards${branchFilter ? `?branchId=${branchFilter}` : ''}`)
      .then(({ jobCards }) => setJobs(jobCards))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load job cards'));
  };

  useEffect(loadJobs, [branchFilter]);

  useEffect(() => {
    Promise.allSettled([
      api.get<{ customers: Customer[] }>('/customers').then(({ customers }) => setCustomers(customers)).catch(() => setCustomers([])),
      api.get<{ technicians: Technician[] }>('/technicians').then(({ technicians }) => setTechnicians(technicians)).catch(() => setTechnicians([])),
    ]).finally(() => setPrereqsLoading(false));
    api.get<{ bays: Bay[] }>('/bays').then(({ bays }) => setBays(bays)).catch(() => setBays([]));
    api.get<{ branches: Branch[] }>('/branches').then(({ branches }) => setBranches(branches)).catch(() => setBranches([]));
    api.get<{ parts: Part[] }>('/parts').then(({ parts }) => setParts(parts)).catch(() => setParts([]));
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, customerId: customers[0]?.id ?? '', technicianId: technicians[0]?.id ?? '' });
    setNewChecklistText('');
    setModalOpen(true);
  };

  const openEdit = (job: JobCard) => {
    setEditing(job);
    setForm({
      customerId: job.customerId,
      vehicle: job.vehicle,
      plate: job.plate ?? '',
      vehicleId: job.vehicleId ?? '',
      service: job.service ?? '',
      technicianId: job.technicianId,
      estimate: String(job.estimate),
      status: job.status,
      bayId: job.bayId ?? '',
      checklist: job.checklist,
      laborCost: String(job.laborCost),
    });
    setAddPartId('');
    setAddPartQty('1');
    setModalOpen(true);
  };

  const addChecklistItem = () => {
    const text = newChecklistText.trim();
    if (!text) return;
    setForm((f) => ({ ...f, checklist: [...f.checklist, { label: text, done: false }] }));
    setNewChecklistText('');
  };
  const removeChecklistItem = (index: number) => {
    setForm((f) => ({ ...f, checklist: f.checklist.filter((_, i) => i !== index) }));
  };
  const toggleChecklistItem = (index: number) => {
    setForm((f) => ({ ...f, checklist: f.checklist.map((c, i) => i === index ? { ...c, done: !c.done } : c) }));
  };

  const addPartUsed = async () => {
    if (!editing || !addPartId || !addPartQty) return;
    setAddingPart(true);
    try {
      const { jobCard } = await api.post<{ jobCard: JobCard }>(`/job-cards/${editing.id}/parts`, { partId: addPartId, qty: Number(addPartQty) || 1 });
      setEditing(jobCard);
      setJobs((prev) => prev.map((j) => j.id === jobCard.id ? jobCard : j));
      setAddPartId('');
      setAddPartQty('1');
      // Stock just changed — refresh the parts list so the picker's own
      // stock figures don't go stale.
      api.get<{ parts: Part[] }>('/parts').then(({ parts }) => setParts(parts)).catch(() => undefined);
      toast.success('Part added');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to add part');
    } finally {
      setAddingPart(false);
    }
  };

  const generateInvoice = async () => {
    if (!editing) return;
    setGeneratingInvoice(true);
    try {
      const { invoice } = await api.post<{ invoice: CustomerInvoice }>(`/job-cards/${editing.id}/invoice`);
      toast.success(`Invoice ${invoice.invoiceNumber} created`);
      setModalOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to generate invoice');
    } finally {
      setGeneratingInvoice(false);
    }
  };

  // Fetch the selected customer's saved vehicles whenever the customer
  // changes, so the "Saved vehicle" picker only ever shows real options.
  useEffect(() => {
    if (!form.customerId) {
      setCustomerVehicles([]);
      return;
    }
    api
      .get<{ vehicles: Vehicle[] }>(`/customers/${form.customerId}/vehicles`)
      .then(({ vehicles }) => setCustomerVehicles(vehicles))
      .catch(() => setCustomerVehicles([]));
  }, [form.customerId]);

  const save = async () => {
    if (!form.customerId || !form.vehicle.trim() || !form.technicianId) {
      toast.error('Customer, vehicle, and technician are required');
      return;
    }
    setSaving(true);
    const body = { ...form, estimate: Number(form.estimate) || 0, laborCost: Number(form.laborCost) || 0, bayId: form.bayId || null };
    try {
      if (editing) {
        const { jobCard } = await api.patch<{ jobCard: JobCard }>(`/job-cards/${editing.id}`, body);
        setJobs((prev) => prev.map((j) => j.id === jobCard.id ? jobCard : j));
        toast.success(`${jobCard.id} updated`);
      } else {
        const { jobCard } = await api.post<{ jobCard: JobCard }>('/job-cards', body);
        setJobs((prev) => [jobCard, ...prev]);
        toast.success('Job card created');
      }
      setModalOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to save job card');
    } finally {
      setSaving(false);
    }
  };

  const move = async (job: JobCard, dir: 1 | -1) => {
    const idx = ORDER.indexOf(job.status);
    const next = ORDER[idx + dir];
    if (!next) return;
    const previous = jobs;
    setJobs((prev) => prev.map((j) => j.id === job.id ? { ...j, status: next } : j));
    try {
      await api.patch(`/job-cards/${job.id}`, { status: next });
      toast.success(`${job.id} → ${next}`);
    } catch (err) {
      setJobs(previous);
      toast.error(err instanceof ApiError ? err.message : 'Failed to update job card');
    }
  };

  return (
    <div>
      <PageHeader
        title="Job Cards"
        description="Track every job through your workshop pipeline."
        action={
        <div className="flex items-center gap-2">
            <div className="flex rounded-xl border border-border-soft p-0.5 dark:border-slate-800">
              <button
              type="button"
              onClick={() => setViewMode('board')}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition',
                viewMode === 'board' ? 'bg-griptor-gradient text-white' : 'text-text-gray hover:text-navy dark:text-slate-400 dark:hover:text-slate-100'
              )}>

                <LayoutGridIcon className="h-3.5 w-3.5" /> Board
              </button>
              <button
              type="button"
              onClick={() => setViewMode('list')}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition',
                viewMode === 'list' ? 'bg-griptor-gradient text-white' : 'text-text-gray hover:text-navy dark:text-slate-400 dark:hover:text-slate-100'
              )}>

                <ListIcon className="h-3.5 w-3.5" /> List
              </button>
            </div>
            <Button onClick={openCreate} disabled={prereqsLoading || customers.length === 0 || technicians.length === 0} loading={prereqsLoading}>
              <PlusIcon className="h-4 w-4" /> New job card
            </Button>
          </div>
        } />


      {!prereqsLoading && (customers.length === 0 || technicians.length === 0) &&
      <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          You need at least one {customers.length === 0 && technicians.length === 0 ? 'customer and one technician' : customers.length === 0 ? 'customer' : 'technician'} before you can create a job card.
        </div>
      }

      {branches.length > 1 &&
      <div className="mb-4 max-w-xs">
          <Select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
            <option value="">All branches</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </div>
      }

      {viewMode === 'board' &&
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {STATUSES.map((col) => {
          const items = jobs.filter((j) => j.status === col.key);
          return (
            <div key={col.key} className={cn('rounded-2xl border border-t-4 border-border-soft bg-white/60 p-3 dark:border-slate-800 dark:bg-slate-900/40', col.accent)}>
              <div className="mb-3 flex items-center justify-between px-1">
                <h3 className="text-sm font-bold text-navy dark:text-slate-100">{col.key}</h3>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-text-gray dark:bg-slate-800 dark:text-slate-300">{items.length}</span>
              </div>
              <div className="space-y-3">
                {items.length === 0 && <p className="px-1 py-6 text-center text-xs text-slate-400">No jobs</p>}
                {items.map((job) =>
                <motion.div
                  layout
                  key={job.id}
                  onClick={() => openEdit(job)}
                  className="cursor-pointer rounded-xl border border-border-soft bg-white p-3.5 shadow-soft transition hover:border-bright-blue dark:border-slate-800 dark:bg-slate-900">

                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-400">{job.id}</span>
                      <div className="flex items-center gap-1.5">
                        {job.bay && <Badge tone="purple">{job.bay}</Badge>}
                        <Badge tone="teal">{formatCurrency(job.estimate)}</Badge>
                      </div>
                    </div>
                    <p className="mt-1.5 font-bold text-navy dark:text-slate-100">{job.service || 'Service TBD'}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-text-gray dark:text-slate-400">
                      <CarIcon className="h-3.5 w-3.5" /> {job.vehicle}{job.plate ? ` · ${job.plate}` : ''}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-text-gray dark:text-slate-400">
                      <UserIcon className="h-3.5 w-3.5" /> {job.technician}
                    </p>
                    <div className="mt-3 flex items-center justify-between border-t border-border-soft pt-2 dark:border-slate-800" onClick={(e) => e.stopPropagation()}>
                      <button
                      onClick={() => move(job, -1)}
                      disabled={ORDER.indexOf(job.status) === 0}
                      className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800"
                      aria-label="Move back">

                        <ChevronLeftIcon className="h-4 w-4" />
                      </button>
                      <span className="text-xs text-slate-400">{job.customer}</span>
                      <button
                      onClick={() => move(job, 1)}
                      disabled={ORDER.indexOf(job.status) === ORDER.length - 1}
                      className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800"
                      aria-label="Move forward">

                        <ChevronRightIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </motion.div>
                )}
              </div>
            </div>);

        })}
      </div>
      }

      {viewMode === 'list' &&
      <Card>
          {jobs.length === 0 ?
        <EmptyState icon={CarIcon} title="No job cards yet" description="Create a job card to see it here." /> :

        <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                    <th className="px-5 py-3 font-bold">Job</th>
                    <th className="px-5 py-3 font-bold">Customer</th>
                    <th className="px-5 py-3 font-bold">Vehicle</th>
                    <th className="px-5 py-3 font-bold">Plate</th>
                    <th className="px-5 py-3 font-bold">Status</th>
                    <th className="px-5 py-3 font-bold">Technician</th>
                    <th className="px-5 py-3 text-right font-bold">Estimate</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) =>
              <tr key={job.id} onClick={() => openEdit(job)} className="cursor-pointer border-b border-border-soft transition last:border-0 hover:bg-soft-gray dark:border-slate-800 dark:hover:bg-slate-800/50">
                      <td className="px-5 py-3 font-bold text-navy dark:text-slate-100">{job.id}</td>
                      <td className="px-5 py-3 text-text-gray dark:text-slate-400">{job.customer}</td>
                      <td className="px-5 py-3 text-text-gray dark:text-slate-400">{job.vehicle}</td>
                      <td className="px-5 py-3 text-text-gray dark:text-slate-400">{job.plate || '—'}</td>
                      <td className="px-5 py-3"><StatusBadge status={job.status} /></td>
                      <td className="px-5 py-3 text-text-gray dark:text-slate-400">{job.technician}</td>
                      <td className="px-5 py-3 text-right font-semibold text-navy dark:text-slate-100">{formatCurrency(job.estimate)}</td>
                    </tr>
              )}
                </tbody>
              </table>
            </div>
        }
        </Card>
      }

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit ${editing.id}` : 'New job card'}
        size="lg"
        footer={
        <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            {editing && editing.status === 'Completed' &&
          <Button variant="secondary" onClick={generateInvoice} loading={generatingInvoice}>
                <ReceiptIcon className="h-4 w-4" /> Generate invoice
              </Button>
          }
            <Button onClick={save} loading={saving}>{editing ? 'Save changes' : 'Create job card'}</Button>
          </>
        }>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="jc-customer">Customer</Label>
            <Select id="jc-customer" value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          {customerVehicles.length > 0 &&
          <div>
              <Label htmlFor="jc-saved-vehicle">Saved vehicle (optional)</Label>
              <Select
              id="jc-saved-vehicle"
              value={form.vehicleId}
              onChange={(e) => {
                const vehicleId = e.target.value;
                const v = customerVehicles.find((cv) => cv.id === vehicleId);
                setForm((f) => ({ ...f, vehicleId, vehicle: v ? v.label : f.vehicle, plate: v ? v.plate ?? '' : f.plate }));
              }}>

                <option value="">— type manually below —</option>
                {customerVehicles.map((v) => <option key={v.id} value={v.id}>{v.label}{v.plate ? ` (${v.plate})` : ''}</option>)}
              </Select>
            </div>
          }
          <div>
            <Label htmlFor="jc-vehicle">Vehicle</Label>
            <Input id="jc-vehicle" value={form.vehicle} onChange={(e) => setForm({ ...form, vehicle: e.target.value, vehicleId: '' })} placeholder="2021 Toyota Camry" />
          </div>
          <div>
            <Label htmlFor="jc-plate">License plate</Label>
            <Input id="jc-plate" value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value })} placeholder="ABC-1234" />
          </div>
          <div>
            <Label htmlFor="jc-estimate">Quoted estimate ($)</Label>
            <Input id="jc-estimate" type="number" value={form.estimate} onChange={(e) => setForm({ ...form, estimate: e.target.value })} placeholder="320" />
          </div>
          <div>
            <Label htmlFor="jc-labor">Labor cost ($)</Label>
            <Input id="jc-labor" type="number" min={0} value={form.laborCost} onChange={(e) => setForm({ ...form, laborCost: e.target.value })} placeholder="0" />
          </div>
          <div>
            <Label htmlFor="jc-tech">Assigned technician</Label>
            <Select id="jc-tech" value={form.technicianId} onChange={(e) => setForm({ ...form, technicianId: e.target.value })}>
              {technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="jc-status">Status</Label>
            <Select id="jc-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as JobStatus })}>
              {[...ORDER, 'Cancelled' as JobStatus].map((s) => <option key={s}>{s}</option>)}
            </Select>
            {form.status === 'Cancelled' &&
            <p className="mt-1 text-xs text-text-gray dark:text-slate-400">Cancelling drops this job off the board and restocks any parts already added.</p>
            }
          </div>
          <div>
            <Label htmlFor="jc-bay">Bay (optional)</Label>
            <Select id="jc-bay" value={form.bayId} onChange={(e) => setForm({ ...form, bayId: e.target.value })}>
              <option value="">— unassigned —</option>
              {bays.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="jc-service">Service / notes</Label>
            <Textarea id="jc-service" value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })} placeholder="Describe the work…" />
          </div>
        </div>
        <div className="mt-4">
          <Label>Checklist</Label>
          {form.checklist.length > 0 &&
          <ul className="mb-2 space-y-1.5">
              {form.checklist.map((c, i) =>
            <li key={i} className="flex items-center justify-between gap-2 text-sm text-navy dark:text-slate-200">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={c.done} onChange={() => toggleChecklistItem(i)} className="rounded border-border-soft text-royal focus:ring-bright-blue" />
                    {c.label}
                  </label>
                  <button type="button" onClick={() => removeChecklistItem(i)} className="rounded-md p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10" aria-label={`Remove ${c.label}`}>
                    <XIcon className="h-3.5 w-3.5" />
                  </button>
                </li>
            )}
            </ul>
          }
          <div className="flex gap-2">
            <Input
            value={newChecklistText}
            onChange={(e) => setNewChecklistText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addChecklistItem())}
            placeholder="Add a checklist item…"
            className="h-9 text-sm" />

            <Button type="button" size="sm" variant="secondary" onClick={addChecklistItem}><PlusIcon className="h-3.5 w-3.5" /> Add</Button>
          </div>
        </div>

        {editing &&
        <div className="mt-4">
            <Label>Parts used</Label>
            {editing.partsUsed.length > 0 &&
          <ul className="mb-2 space-y-1.5">
                {editing.partsUsed.map((p, i) =>
            <li key={i} className="flex items-center justify-between text-sm text-navy dark:text-slate-200">
                    <span className="flex items-center gap-1.5"><WrenchIcon className="h-3.5 w-3.5 text-teal" /> {p.name} × {p.qty}</span>
                    <span className="font-semibold">{formatCurrency(p.price * p.qty)}</span>
                  </li>
            )}
              </ul>
          }
            {editing.status !== 'Completed' ?
          <div className="flex gap-2">
                <Select value={addPartId} onChange={(e) => setAddPartId(e.target.value)} className="flex-1">
                  <option value="">Select a part…</option>
                  {parts.filter((p) => !editing.branchId || !p.branchId || p.branchId === editing.branchId).map((p) =>
              <option key={p.id} value={p.id} disabled={p.stock <= 0}>{p.name} ({p.stock} in stock)</option>
              )}
                </Select>
                <Input type="number" min={1} value={addPartQty} onChange={(e) => setAddPartQty(e.target.value)} className="w-20" />
                <Button type="button" size="sm" variant="secondary" onClick={addPartUsed} loading={addingPart} disabled={!addPartId}>Add</Button>
              </div> :

          <p className="text-xs text-text-gray dark:text-slate-400">This job is completed — its parts list is locked.</p>
          }
          </div>
        }

        {editing &&
        <div className="mt-4 grid grid-cols-2 gap-3 text-center">
            <div className="rounded-xl bg-soft-gray p-3 dark:bg-slate-800/60">
              <p className="text-xs font-semibold text-text-gray dark:text-slate-400">Quoted estimate</p>
              <p className="mt-0.5 text-lg font-extrabold text-navy dark:text-slate-100">{formatCurrency(editing.estimate)}</p>
            </div>
            <div className="rounded-xl bg-soft-gray p-3 dark:bg-slate-800/60">
              <p className="text-xs font-semibold text-text-gray dark:text-slate-400">Actual (parts + labor)</p>
              <p className="mt-0.5 text-lg font-extrabold text-navy dark:text-slate-100">{formatCurrency(actualCost(editing))}</p>
            </div>
          </div>
        }
      </Modal>
    </div>);

}

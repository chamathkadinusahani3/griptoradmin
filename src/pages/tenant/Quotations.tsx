import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FileTextIcon, PlusIcon, TrashIcon, DownloadIcon, ArrowRightIcon, WrenchIcon, ClipboardCheckIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { StatusBadge } from '../../components/StatusBadge';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Textarea, Label } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { Quotation, QuotationStatus, LineItem } from '../../types/quotation';
import { Customer } from '../../types/customer';
import { JobCard } from '../../types/jobCard';
import { Technician } from '../../types/technician';
import { formatCurrency, formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { downloadDocumentPdf } from '../../lib/pdf';

const STATUS_FILTERS: ('All' | QuotationStatus)[] = ['All', 'Draft', 'Pending', 'Approved', 'Rejected', 'Invoiced'];
const emptyItem: LineItem = { description: '', quantity: 1, unitPrice: 0 };
const emptyForm = { customerId: '', jobCardId: '', vehicle: '', plate: '', notes: '', validUntil: '' };

export function Quotations() {
  const { user } = useAuth();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [jobCards, setJobCards] = useState<JobCard[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'All' | QuotationStatus>('All');

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [items, setItems] = useState<LineItem[]>([{ ...emptyItem }]);
  const [saving, setSaving] = useState(false);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [startJobTarget, setStartJobTarget] = useState<Quotation | null>(null);
  const [startJobTechId, setStartJobTechId] = useState('');
  const [startingJob, setStartingJob] = useState(false);

  const loadQuotations = () => {
    api
      .get<{ quotations: Quotation[] }>('/quotations')
      .then(({ quotations }) => setQuotations(quotations))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load quotations'))
      .finally(() => setLoading(false));
  };

  useEffect(loadQuotations, []);

  useEffect(() => {
    api.get<{ customers: Customer[] }>('/customers').then(({ customers }) => setCustomers(customers)).catch(() => setCustomers([]));
    api.get<{ jobCards: JobCard[] }>('/job-cards').then(({ jobCards }) => setJobCards(jobCards)).catch(() => setJobCards([]));
    api.get<{ technicians: Technician[] }>('/technicians').then(({ technicians }) => setTechnicians(technicians)).catch(() => setTechnicians([]));
  }, []);

  const openCreate = () => {
    setForm({ ...emptyForm, customerId: customers[0]?.id ?? '' });
    setItems([{ ...emptyItem }]);
    setModalOpen(true);
  };

  const updateItem = (i: number, patch: Partial<LineItem>) => {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  };
  const addItem = () => setItems((prev) => [...prev, { ...emptyItem }]);
  const removeItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));

  const previewSubtotal = items.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0);
  const selectedCustomerDiscountPct = customers.find((c) => c.id === form.customerId)?.discountPct ?? 0;

  const save = async () => {
    if (!form.customerId || !form.vehicle.trim() || items.every((it) => !it.description.trim())) {
      toast.error('Customer, vehicle, and at least one item are required');
      return;
    }
    setSaving(true);
    try {
      const { quotation } = await api.post<{ quotation: Quotation }>('/quotations', {
        ...form,
        jobCardId: form.jobCardId || undefined,
        validUntil: form.validUntil || undefined,
        items: items.filter((it) => it.description.trim()),
      });
      setQuotations((prev) => [quotation, ...prev]);
      toast.success(`${quotation.quoteNumber} created`);
      setModalOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to create quotation');
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (q: Quotation, status: QuotationStatus) => {
    const previous = quotations;
    setQuotations((prev) => prev.map((x) => (x.id === q.id ? { ...x, status } : x)));
    try {
      await api.patch(`/quotations/${q.id}`, { status });
    } catch (err) {
      setQuotations(previous);
      toast.error(err instanceof ApiError ? err.message : 'Failed to update quotation');
    }
  };

  const convert = async (q: Quotation) => {
    setConvertingId(q.id);
    try {
      const { invoice } = await api.post<{ invoice: { invoiceNumber: string } }>(`/quotations/${q.id}/convert`);
      setQuotations((prev) => prev.map((x) => (x.id === q.id ? { ...x, status: 'Invoiced' } : x)));
      toast.success(`Converted to invoice ${invoice.invoiceNumber}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to convert quotation');
    } finally {
      setConvertingId(null);
    }
  };

  const openStartJob = (q: Quotation) => {
    setStartJobTarget(q);
    setStartJobTechId(technicians[0]?.id ?? '');
  };

  const doStartJob = async () => {
    if (!startJobTarget || !startJobTechId) return;
    setStartingJob(true);
    try {
      const { jobCard } = await api.post<{ jobCard: JobCard }>(`/quotations/${startJobTarget.id}/convert-to-job`, { technicianId: startJobTechId });
      setQuotations((prev) => prev.map((x) => (x.id === startJobTarget.id ? { ...x, jobCardId: jobCard.id } : x)));
      toast.success('Job card created');
      setStartJobTarget(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to start job');
    } finally {
      setStartingJob(false);
    }
  };

  const downloadPdf = (q: Quotation) => {
    downloadDocumentPdf({
      title: 'Quotation',
      number: q.quoteNumber,
      date: q.createdAt,
      garageName: user?.garageName,
      customerName: q.customer,
      vehicle: q.vehicle,
      plate: q.plate,
      items: q.items,
      subtotal: q.subtotal,
      discountPct: q.discountPct,
      discountAmount: q.discountAmount,
      taxAmount: q.taxAmount,
      total: q.total,
      extraLines: [{ label: 'Status', value: q.status }],
      notes: q.notes,
    });
  };

  const filtered = statusFilter === 'All' ? quotations : quotations.filter((q) => q.status === statusFilter);
  const noPrereqs = customers.length === 0;

  return (
    <div>
      <PageHeader
        title="Quotations"
        description="Send price quotes to customers before starting work."
        action={
        <Button onClick={openCreate} disabled={noPrereqs} title={noPrereqs ? 'Add a customer first' : undefined}>
            <PlusIcon className="h-4 w-4" /> New quotation
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
      <Card><div className="space-y-3 p-5">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div></Card> :
      filtered.length === 0 ?
      <Card><EmptyState icon={FileTextIcon} title="No quotations" description="Create a quotation to send a price estimate to a customer." /></Card> :

      <Card>
          <ul className="divide-y divide-border-soft dark:divide-slate-800">
            {filtered.map((q) =>
          <li key={q.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-navy dark:text-slate-100">{q.quoteNumber}</p>
                    <StatusBadge status={q.status} />
                  </div>
                  <p className="mt-1 text-xs text-text-gray dark:text-slate-400">{q.customer} · {q.vehicle}{q.plate ? ` · ${q.plate}` : ''}</p>
                  <p className="mt-1 text-xs text-text-gray dark:text-slate-400">{formatDate(q.createdAt)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="teal">{formatCurrency(q.total)}</Badge>
                  <Button size="sm" variant="ghost" onClick={() => downloadPdf(q)}><DownloadIcon className="h-3.5 w-3.5" /> PDF</Button>
                  {q.status === 'Draft' && <Button size="sm" variant="secondary" onClick={() => setStatus(q, 'Pending')}>Send</Button>}
                  {q.status === 'Pending' &&
              <>
                      <Button size="sm" variant="secondary" onClick={() => setStatus(q, 'Approved')}>Approve</Button>
                      <Button size="sm" variant="ghost" onClick={() => setStatus(q, 'Rejected')}>Reject</Button>
                    </>
              }
                  {q.status === 'Approved' && !q.jobCardId &&
              <Button size="sm" variant="secondary" onClick={() => openStartJob(q)}>
                      <WrenchIcon className="h-3.5 w-3.5" /> Start job
                    </Button>
              }
                  {q.jobCardId && <Badge tone="green"><ClipboardCheckIcon className="h-3 w-3" /> Job card</Badge>}
                  {q.status === 'Approved' &&
              <Button size="sm" onClick={() => convert(q)} loading={convertingId === q.id}>
                      <ArrowRightIcon className="h-3.5 w-3.5" /> Convert to invoice
                    </Button>
              }
                </div>
              </li>
          )}
          </ul>
        </Card>
      }

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="New quotation"
        size="xl"
        footer={
        <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={save} loading={saving}>Create quotation</Button>
          </>
        }>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="q-customer">Customer</Label>
            <Select id="q-customer" value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="q-job">Job card (optional)</Label>
            <Select
              id="q-job"
              value={form.jobCardId}
              onChange={(e) => {
                const jobCardId = e.target.value;
                const linked = jobCards.find((j) => j.id === jobCardId);
                // The server always derives vehicle/plate from the linked job
                // card when one is set (never trusts these text fields in
                // that case) — auto-filling and locking them here keeps the
                // form honest about what will actually be saved.
                setForm((f) => ({
                  ...f,
                  jobCardId,
                  vehicle: linked ? linked.vehicle : f.vehicle,
                  plate: linked ? linked.plate ?? '' : f.plate,
                }));
              }}>

              <option value="">— none —</option>
              {jobCards.map((j) => <option key={j.id} value={j.id}>{j.id} — {j.vehicle}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="q-vehicle">Vehicle</Label>
            <Input id="q-vehicle" disabled={!!form.jobCardId} value={form.vehicle} onChange={(e) => setForm({ ...form, vehicle: e.target.value })} placeholder="2021 Toyota Camry" />
            {form.jobCardId && <p className="mt-1 text-xs text-text-gray dark:text-slate-400">Auto-filled from the linked job card</p>}
          </div>
          <div>
            <Label htmlFor="q-plate">License plate</Label>
            <Input id="q-plate" disabled={!!form.jobCardId} value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value })} placeholder="ABC-1234" />
          </div>
          <div>
            <Label htmlFor="q-valid">Valid until (optional)</Label>
            <Input id="q-valid" type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} />
          </div>
        </div>

        <div className="mt-4">
          <Label>Line items</Label>
          <div className="space-y-2">
            {items.map((it, i) =>
            <div key={i} className="grid grid-cols-12 gap-2">
                <Input className="col-span-6" placeholder="Description" value={it.description} onChange={(e) => updateItem(i, { description: e.target.value })} />
                <Input className="col-span-2" type="number" placeholder="Qty" value={it.quantity} onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })} />
                <Input className="col-span-3" type="number" placeholder="Unit price" value={it.unitPrice} onChange={(e) => updateItem(i, { unitPrice: Number(e.target.value) })} />
                <button type="button" onClick={() => removeItem(i)} className="col-span-1 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40">
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
          <button type="button" onClick={addItem} className="mt-2 flex items-center gap-1 text-xs font-semibold text-royal hover:underline dark:text-blue-300">
            <PlusIcon className="h-3.5 w-3.5" /> Add line
          </button>
          <p className="mt-2 text-right text-sm text-text-gray dark:text-slate-400">
            Subtotal: {formatCurrency(previewSubtotal)}
            {selectedCustomerDiscountPct > 0 && ` · Discount: ${selectedCustomerDiscountPct}%`} (tax added automatically)
          </p>
        </div>

        <div className="mt-4">
          <Label htmlFor="q-notes">Notes</Label>
          <Textarea id="q-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
      </Modal>

      <Modal
        open={!!startJobTarget}
        onClose={() => setStartJobTarget(null)}
        title="Start job"
        footer={
        <>
            <Button variant="secondary" onClick={() => setStartJobTarget(null)}>Cancel</Button>
            <Button onClick={doStartJob} loading={startingJob} disabled={!startJobTechId}>Create job card</Button>
          </>
        }>

        <Label htmlFor="start-job-tech">Assign a technician</Label>
        <Select id="start-job-tech" value={startJobTechId} onChange={(e) => setStartJobTechId(e.target.value)}>
          {technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
        {technicians.length === 0 && <p className="mt-2 text-xs text-red-600">Add a technician first.</p>}
      </Modal>
    </div>);

}

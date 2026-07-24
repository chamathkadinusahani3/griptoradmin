import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ReceiptIcon, PlusIcon, TrashIcon, DownloadIcon, DollarSignIcon, WalletIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { StatCard } from '../../components/ui/StatCard';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { StatusBadge } from '../../components/StatusBadge';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Textarea, Label } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { CustomerInvoice, InvoiceStatus, PaymentMethod } from '../../types/customerInvoice';
import { LineItem } from '../../types/quotation';
import { Customer } from '../../types/customer';
import { JobCard } from '../../types/jobCard';
import { formatCurrency, formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { downloadDocumentPdf } from '../../lib/pdf';

const STATUS_FILTERS: ('All' | InvoiceStatus)[] = ['All', 'Draft', 'Issued', 'Paid', 'Void'];
const PAYMENT_METHODS: PaymentMethod[] = ['Cash', 'Card', 'Bank Transfer', 'Other'];
const emptyItem: LineItem = { description: '', quantity: 1, unitPrice: 0 };
const emptyForm = { customerId: '', jobCardId: '', vehicle: '', plate: '', notes: '', dueDate: '' };

export function CustomerInvoices() {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<CustomerInvoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [jobCards, setJobCards] = useState<JobCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'All' | InvoiceStatus>('All');

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [items, setItems] = useState<LineItem[]>([{ ...emptyItem }]);
  const [saving, setSaving] = useState(false);

  const [payTarget, setPayTarget] = useState<CustomerInvoice | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('Cash');
  const [paying, setPaying] = useState(false);

  const loadInvoices = () => {
    api
      .get<{ invoices: CustomerInvoice[] }>('/customer-invoices')
      .then(({ invoices }) => setInvoices(invoices))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load invoices'))
      .finally(() => setLoading(false));
  };

  useEffect(loadInvoices, []);

  useEffect(() => {
    api.get<{ customers: Customer[] }>('/customers').then(({ customers }) => setCustomers(customers)).catch(() => setCustomers([]));
    api.get<{ jobCards: JobCard[] }>('/job-cards').then(({ jobCards }) => setJobCards(jobCards.filter((j) => j.status === 'Completed'))).catch(() => setJobCards([]));
  }, []);

  const { revenueThisMonth, outstandingBalance } = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const revenue = invoices
      .filter((inv) => new Date(inv.createdAt) >= monthStart && inv.status !== 'Void')
      .reduce((sum, inv) => sum + inv.paidAmount, 0);
    const outstanding = invoices.filter((inv) => inv.status !== 'Void').reduce((sum, inv) => sum + inv.balance, 0);
    return { revenueThisMonth: revenue, outstandingBalance: outstanding };
  }, [invoices]);

  const openCreate = () => {
    setForm({ ...emptyForm, customerId: customers[0]?.id ?? '' });
    setItems([{ ...emptyItem }]);
    setModalOpen(true);
  };

  const fillFromJobCard = (jobCardId: string) => {
    const job = jobCards.find((j) => j.id === jobCardId);
    setForm((f) => ({ ...f, jobCardId, customerId: job?.customerId ?? f.customerId, vehicle: job?.vehicle ?? f.vehicle, plate: job?.plate ?? f.plate }));
    if (job) setItems([{ description: job.service || 'Service', quantity: 1, unitPrice: job.estimate }]);
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
      const { invoice } = await api.post<{ invoice: CustomerInvoice }>('/customer-invoices', {
        ...form,
        jobCardId: form.jobCardId || undefined,
        dueDate: form.dueDate || undefined,
        items: items.filter((it) => it.description.trim()),
      });
      setInvoices((prev) => [invoice, ...prev]);
      toast.success(`${invoice.invoiceNumber} created`);
      setModalOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to create invoice');
    } finally {
      setSaving(false);
    }
  };

  const openPay = (inv: CustomerInvoice) => {
    setPayTarget(inv);
    setPayAmount(String(inv.balance));
    setPayMethod('Cash');
  };

  const recordPayment = async () => {
    if (!payTarget) return;
    const amount = Number(payAmount);
    if (!amount || amount <= 0) {
      toast.error('Enter a valid payment amount');
      return;
    }
    setPaying(true);
    try {
      const { invoice } = await api.post<{ invoice: CustomerInvoice }>(`/customer-invoices/${payTarget.id}/payment`, {
        amount,
        method: payMethod,
      });
      setInvoices((prev) => prev.map((x) => (x.id === invoice.id ? invoice : x)));
      toast.success('Payment recorded');
      setPayTarget(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to record payment');
    } finally {
      setPaying(false);
    }
  };

  const voidInvoice = async (inv: CustomerInvoice) => {
    const previous = invoices;
    setInvoices((prev) => prev.map((x) => (x.id === inv.id ? { ...x, status: 'Void' } : x)));
    try {
      await api.patch(`/customer-invoices/${inv.id}`, { status: 'Void' });
    } catch (err) {
      setInvoices(previous);
      toast.error(err instanceof ApiError ? err.message : 'Failed to void invoice');
    }
  };

  const downloadPdf = (inv: CustomerInvoice) => {
    downloadDocumentPdf({
      title: 'Invoice',
      number: inv.invoiceNumber,
      date: inv.createdAt,
      garageName: user?.garageName,
      customerName: inv.customer,
      vehicle: inv.vehicle,
      plate: inv.plate,
      items: inv.items,
      subtotal: inv.subtotal,
      discountPct: inv.discountPct,
      discountAmount: inv.discountAmount,
      taxAmount: inv.taxAmount,
      total: inv.total,
      extraLines: [
        { label: 'Paid', value: formatCurrency(inv.paidAmount) },
        { label: 'Balance', value: formatCurrency(inv.balance) },
      ],
      notes: inv.notes,
    });
  };

  const filtered = statusFilter === 'All' ? invoices : invoices.filter((inv) => inv.status === statusFilter);
  const noPrereqs = customers.length === 0;

  return (
    <div>
      <PageHeader
        title="Invoices"
        description="Bill your customers and track payments."
        action={
        <Button onClick={openCreate} disabled={noPrereqs} title={noPrereqs ? 'Add a customer first' : undefined}>
            <PlusIcon className="h-4 w-4" /> New invoice
          </Button>
        } />


      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Collected this month" value={formatCurrency(revenueThisMonth)} icon={DollarSignIcon} />
        <StatCard label="Outstanding balance" value={formatCurrency(outstandingBalance)} icon={WalletIcon} />
      </div>

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
      <Card><EmptyState icon={ReceiptIcon} title="No invoices" description="Create an invoice manually, or from a completed job card." /></Card> :

      <Card>
          <ul className="divide-y divide-border-soft dark:divide-slate-800">
            {filtered.map((inv) =>
          <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-navy dark:text-slate-100">{inv.invoiceNumber}</p>
                    <StatusBadge status={inv.status} />
                    <StatusBadge status={inv.paymentStatus} />
                  </div>
                  <p className="mt-1 text-xs text-text-gray dark:text-slate-400">{inv.customer} · {inv.vehicle}{inv.plate ? ` · ${inv.plate}` : ''}</p>
                  <p className="mt-1 text-xs text-text-gray dark:text-slate-400">{formatDate(inv.createdAt)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="teal">{formatCurrency(inv.total)}</Badge>
                  {inv.balance > 0 && <Badge tone="amber">{formatCurrency(inv.balance)} due</Badge>}
                  <Button size="sm" variant="ghost" onClick={() => downloadPdf(inv)}><DownloadIcon className="h-3.5 w-3.5" /> PDF</Button>
                  {inv.status !== 'Void' && inv.balance > 0 &&
              <Button size="sm" variant="secondary" onClick={() => openPay(inv)}>Record payment</Button>
              }
                  {inv.status !== 'Void' && inv.status !== 'Paid' &&
              <Button size="sm" variant="ghost" onClick={() => voidInvoice(inv)}>Void</Button>
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
        title="New invoice"
        size="xl"
        footer={
        <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={save} loading={saving}>Create invoice</Button>
          </>
        }>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="inv-job">Fill from a completed job card (optional)</Label>
            <Select id="inv-job" value={form.jobCardId} onChange={(e) => fillFromJobCard(e.target.value)}>
              <option value="">— manual entry —</option>
              {jobCards.map((j) => <option key={j.id} value={j.id}>{j.id} — {j.vehicle} ({formatCurrency(j.estimate)})</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="inv-customer">Customer</Label>
            <Select id="inv-customer" value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="inv-due">Due date (optional)</Label>
            <Input id="inv-due" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="inv-vehicle">Vehicle</Label>
            <Input id="inv-vehicle" disabled={!!form.jobCardId} value={form.vehicle} onChange={(e) => setForm({ ...form, vehicle: e.target.value })} placeholder="2021 Toyota Camry" />
            {form.jobCardId && <p className="mt-1 text-xs text-text-gray dark:text-slate-400">Auto-filled from the linked job card</p>}
          </div>
          <div>
            <Label htmlFor="inv-plate">License plate</Label>
            <Input id="inv-plate" disabled={!!form.jobCardId} value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value })} placeholder="ABC-1234" />
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
          <Label htmlFor="inv-notes">Notes</Label>
          <Textarea id="inv-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
      </Modal>

      <Modal
        open={!!payTarget}
        onClose={() => setPayTarget(null)}
        title={payTarget ? `Record payment — ${payTarget.invoiceNumber}` : ''}
        footer={
        <>
            <Button variant="secondary" onClick={() => setPayTarget(null)}>Cancel</Button>
            <Button onClick={recordPayment} loading={paying}>Record payment</Button>
          </>
        }>

        {payTarget &&
        <div className="space-y-4">
            <p className="text-sm text-text-gray dark:text-slate-400">Balance due: <span className="font-bold text-navy dark:text-slate-100">{formatCurrency(payTarget.balance)}</span></p>
            <div>
              <Label htmlFor="pay-amount">Amount</Label>
              <Input id="pay-amount" type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="pay-method">Method</Label>
              <Select id="pay-method" value={payMethod} onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}>
                {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
              </Select>
            </div>
          </div>
        }
      </Modal>
    </div>);

}

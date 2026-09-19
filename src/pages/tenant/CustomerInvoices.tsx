import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ReceiptIcon, PlusIcon, TrashIcon, DownloadIcon, DollarSignIcon, WalletIcon, LinkIcon, PencilIcon, UserPlusIcon, ExternalLinkIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { StatCard } from '../../components/ui/StatCard';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { StatusBadge } from '../../components/StatusBadge';
import { SalesAttachmentsButton } from '../../components/SalesAttachments';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Textarea, Label } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { CustomerInvoice, InvoiceStatus, PaymentMethod } from '../../types/customerInvoice';
import { LineItem } from '../../types/quotation';
import { Customer } from '../../types/customer';
import { JobCard } from '../../types/jobCard';
import { SalesOrder } from '../../types/salesOrder';
import { BankAccount } from '../../types/bankAccount';
import { formatCurrency, formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { downloadDocumentPdf } from '../../lib/pdf';

// Sales orders eligible to raise an invoice from — a Pending Approval order
// isn't a real commitment yet, and a Cancelled one never will be.
const INVOICEABLE_SALES_ORDER_STATUSES = ['Confirmed', 'Partially Fulfilled', 'Fulfilled'];

const STATUS_FILTERS: ('All' | InvoiceStatus)[] = ['All', 'Draft', 'Issued', 'Paid', 'Void'];
const PAYMENT_METHODS: PaymentMethod[] = ['Cash', 'Card', 'Bank Transfer', 'Cheque', 'Other'];
const emptyItem: LineItem = { description: '', quantity: 1, unitPrice: 0 };
const emptyForm = { customerId: '', jobCardId: '', salesOrderId: '', vehicle: '', plate: '', notes: '', dueDate: '' };
const emptyQuickCustomer = { name: '', email: '', phone: '' };

export function CustomerInvoices() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { moduleId } = useParams();
  const [invoices, setInvoices] = useState<CustomerInvoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [jobCards, setJobCards] = useState<JobCard[]>([]);
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'All' | InvoiceStatus>('All');

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [items, setItems] = useState<LineItem[]>([{ ...emptyItem }]);
  const [saving, setSaving] = useState(false);

  // Quick-add-customer, reachable directly from the invoice form when the
  // customer/dealer you need isn't in the list yet — a minimal subset of
  // Customers.tsx's own create form (name + email required, matching that
  // page's own validation), not a full duplicate of it.
  const [quickCustomerOpen, setQuickCustomerOpen] = useState(false);
  const [quickCustomerForm, setQuickCustomerForm] = useState(emptyQuickCustomer);
  const [quickCustomerSaving, setQuickCustomerSaving] = useState(false);

  const [editTarget, setEditTarget] = useState<CustomerInvoice | null>(null);
  const [editForm, setEditForm] = useState({ vehicle: '', plate: '', dueDate: '', notes: '' });
  const [editItems, setEditItems] = useState<LineItem[]>([]);
  const [editSaving, setEditSaving] = useState(false);

  const [payTarget, setPayTarget] = useState<CustomerInvoice | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('Cash');
  const [payChequeNumber, setPayChequeNumber] = useState('');
  const [payBankAccountId, setPayBankAccountId] = useState('');
  const [paying, setPaying] = useState(false);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [creatingLinkFor, setCreatingLinkFor] = useState<string | null>(null);

  const loadInvoices = () => {
    api
      .get<{ invoices: CustomerInvoice[] }>('/customer-invoices')
      .then(({ invoices }) => setInvoices(invoices))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load invoices'))
      .finally(() => setLoading(false));
  };

  useEffect(loadInvoices, []);

  const loadCustomers = () => {
    api.get<{ customers: Customer[] }>('/customers').then(({ customers }) => setCustomers(customers)).catch(() => setCustomers([]));
  };

  useEffect(() => {
    loadCustomers();
    api.get<{ jobCards: JobCard[] }>('/job-cards').then(({ jobCards }) => setJobCards(jobCards.filter((j) => j.status === 'Completed'))).catch(() => setJobCards([]));
    api
      .get<{ salesOrders: SalesOrder[] }>('/sales-orders')
      .then(({ salesOrders }) => setSalesOrders(salesOrders.filter((o) => INVOICEABLE_SALES_ORDER_STATUSES.includes(o.status))))
      .catch(() => setSalesOrders([]));
    api.get<{ bankAccounts: BankAccount[] }>('/bank-accounts').then(({ bankAccounts }) => setBankAccounts(bankAccounts)).catch(() => setBankAccounts([]));
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
    setForm((f) => ({ ...f, jobCardId, salesOrderId: '', customerId: job?.customerId ?? f.customerId, vehicle: job?.vehicle ?? f.vehicle, plate: job?.plate ?? f.plate }));
    if (job) setItems([{ description: job.service || 'Service', quantity: 1, unitPrice: job.estimate }]);
  };

  // SalesOrder has no vehicle concept at all (it's a parts/counter order),
  // so unlike fillFromJobCard this never touches vehicle/plate — those stay
  // whatever the user already typed, still fully editable.
  const fillFromSalesOrder = (salesOrderId: string) => {
    const order = salesOrders.find((o) => o.id === salesOrderId);
    setForm((f) => ({ ...f, salesOrderId, jobCardId: '', customerId: order?.customerId ?? f.customerId }));
    if (order) setItems(order.items.map((it) => ({ description: it.name, quantity: it.quantity, unitPrice: it.unitPrice })));
  };

  const openNewSalesOrder = () => {
    // Sales Order creation is a large, separate form (customer, salesperson,
    // department, delivery info, per-line discounts…) — not worth
    // duplicating inline here. Navigating there and back preserves this
    // codebase's "one real form per document" convention; ?create=1 tells
    // that page to open its own create modal immediately on arrival.
    navigate(`/app/${moduleId}/sales-orders?create=1`);
  };

  const openQuickAddCustomer = () => {
    setQuickCustomerForm(emptyQuickCustomer);
    setQuickCustomerOpen(true);
  };

  const saveQuickCustomer = async () => {
    if (!quickCustomerForm.name.trim() || !quickCustomerForm.email.trim()) {
      toast.error('Name and email are required');
      return;
    }
    setQuickCustomerSaving(true);
    try {
      const { customer } = await api.post<{ customer: Customer }>('/customers', {
        name: quickCustomerForm.name.trim(),
        email: quickCustomerForm.email.trim(),
        phone: quickCustomerForm.phone || undefined,
        sourceModule: moduleId,
      });
      setCustomers((prev) => [customer, ...prev]);
      setForm((f) => ({ ...f, customerId: customer.id }));
      toast.success(`${customer.name} added`);
      setQuickCustomerOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to add customer');
    } finally {
      setQuickCustomerSaving(false);
    }
  };

  const updateItem = (i: number, patch: Partial<LineItem>) => {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  };
  const addItem = () => setItems((prev) => [...prev, { ...emptyItem }]);
  const removeItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));
  const previewSubtotal = items.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0);
  const selectedCustomer = customers.find((c) => c.id === form.customerId);
  const selectedCustomerDiscountPct = selectedCustomer?.discountPct ?? 0;

  const save = async () => {
    if (!form.customerId || !form.vehicle.trim() || items.every((it) => !it.description.trim())) {
      toast.error('Customer, vehicle, and at least one item are required');
      return;
    }
    setSaving(true);
    try {
      const { invoice, creditWarning, returnRatioWarning, discountWarning } = await api.post<{ invoice: CustomerInvoice; creditWarning?: string; returnRatioWarning?: string; discountWarning?: string }>('/customer-invoices', {
        ...form,
        jobCardId: form.jobCardId || undefined,
        dueDate: form.dueDate || undefined,
        items: items.filter((it) => it.description.trim()),
      });
      setInvoices((prev) => [invoice, ...prev]);
      toast.success(`${invoice.invoiceNumber} created`);
      if (creditWarning) toast.warning(creditWarning);
      if (returnRatioWarning) toast.warning(returnRatioWarning);
      if (discountWarning) toast.warning(discountWarning);
      setModalOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to create invoice');
    } finally {
      setSaving(false);
    }
  };

  const editableItems = (inv: CustomerInvoice) => inv.status === 'Draft' || inv.status === 'Issued';

  const openEdit = (inv: CustomerInvoice) => {
    setEditTarget(inv);
    setEditForm({ vehicle: inv.vehicle, plate: inv.plate ?? '', dueDate: inv.dueDate ? inv.dueDate.slice(0, 10) : '', notes: inv.notes ?? '' });
    setEditItems(inv.items.map((it) => ({ ...it })));
  };

  const updateEditItem = (i: number, patch: Partial<LineItem>) => {
    setEditItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  };
  const addEditItem = () => setEditItems((prev) => [...prev, { ...emptyItem }]);
  const removeEditItem = (i: number) => setEditItems((prev) => prev.filter((_, idx) => idx !== i));

  const saveEdit = async () => {
    if (!editTarget) return;
    if (!editForm.vehicle.trim()) {
      toast.error('Vehicle is required');
      return;
    }
    const itemsEditable = editableItems(editTarget);
    if (itemsEditable && editItems.every((it) => !it.description.trim())) {
      toast.error('At least one line item is required');
      return;
    }
    setEditSaving(true);
    try {
      const { invoice } = await api.patch<{ invoice: CustomerInvoice }>(`/customer-invoices/${editTarget.id}`, {
        vehicle: editForm.vehicle.trim(),
        plate: editForm.plate.trim() || undefined,
        dueDate: editForm.dueDate || undefined,
        notes: editForm.notes,
        ...(itemsEditable ? { items: editItems.filter((it) => it.description.trim()) } : {}),
      });
      setInvoices((prev) => prev.map((x) => (x.id === invoice.id ? invoice : x)));
      toast.success('Invoice updated');
      setEditTarget(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update invoice');
    } finally {
      setEditSaving(false);
    }
  };

  const openPay = (inv: CustomerInvoice) => {
    setPayTarget(inv);
    setPayAmount(String(inv.balance));
    setPayMethod('Cash');
    setPayChequeNumber('');
    setPayBankAccountId('');
  };

  const recordPayment = async () => {
    if (!payTarget) return;
    const amount = Number(payAmount);
    if (!amount || amount <= 0) {
      toast.error('Enter a valid payment amount');
      return;
    }
    if (payMethod === 'Cheque' && !payChequeNumber.trim()) {
      toast.error('Enter the cheque number');
      return;
    }
    setPaying(true);
    try {
      const { invoice } = await api.post<{ invoice: CustomerInvoice }>(`/customer-invoices/${payTarget.id}/payment`, {
        amount,
        method: payMethod,
        chequeNumber: payMethod === 'Cheque' ? payChequeNumber.trim() : undefined,
        bankAccountId: payBankAccountId || undefined,
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

  const getPaymentLink = async (inv: CustomerInvoice) => {
    setCreatingLinkFor(inv.id);
    try {
      const { url } = await api.post<{ url: string }>(`/customer-invoices/${inv.id}/checkout`);
      await navigator.clipboard.writeText(url);
      toast.success('Payment link copied', { description: 'Send it to the customer via WhatsApp, SMS, or however you usually reach them.' });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to create payment link');
    } finally {
      setCreatingLinkFor(null);
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
      kind: 'sales',
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
          <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 border-l-4 border-l-blue-500 p-4 dark:border-l-blue-400">
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
                  <SalesAttachmentsButton
                    docType="customer-invoices"
                    basePath={`/customer-invoices/${inv.id}/attachments`}
                    attachments={inv.attachments}
                    onChange={(next) => setInvoices((prev) => prev.map((x) => (x.id === inv.id ? { ...x, attachments: next } : x)))} />
                  <Button size="sm" variant="ghost" onClick={() => downloadPdf(inv)}><DownloadIcon className="h-3.5 w-3.5" /> PDF</Button>
                  {inv.status !== 'Void' &&
              <Button size="sm" variant="ghost" onClick={() => openEdit(inv)}><PencilIcon className="h-3.5 w-3.5" /> Edit</Button>
              }
                  {inv.status !== 'Void' && inv.balance > 0 &&
              <Button size="sm" variant="secondary" onClick={() => openPay(inv)}>Record payment</Button>
              }
                  {inv.status !== 'Void' && inv.balance > 0 &&
              <Button size="sm" variant="ghost" onClick={() => getPaymentLink(inv)} loading={creatingLinkFor === inv.id}>
                      <LinkIcon className="h-3.5 w-3.5" /> Payment link
                    </Button>
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
          <div className="sm:col-span-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="inv-sales-order">Fill from a sales order (optional)</Label>
              <button type="button" onClick={openNewSalesOrder} className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-royal hover:underline dark:text-blue-300">
                <ExternalLinkIcon className="h-3.5 w-3.5" /> New sales order
              </button>
            </div>
            <Select id="inv-sales-order" value={form.salesOrderId} onChange={(e) => fillFromSalesOrder(e.target.value)}>
              <option value="">— manual entry —</option>
              {salesOrders.map((o) => <option key={o.id} value={o.id}>{o.salesOrderNumber} — {o.customerName ?? 'Unknown'} ({formatCurrency(o.total)})</option>)}
            </Select>
            {form.salesOrderId && <p className="mt-1 text-xs text-text-gray dark:text-slate-400">Items and customer filled from this order — vehicle isn't tracked on sales orders, so fill it in below.</p>}
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="inv-customer">Customer</Label>
              <button type="button" onClick={openQuickAddCustomer} className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-royal hover:underline dark:text-blue-300">
                <UserPlusIcon className="h-3.5 w-3.5" /> New customer
              </button>
            </div>
            <Select id="inv-customer" value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}>
              <option value="">— select —</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.registrationType === 'dealer' ? ' — Dealer' : ''}</option>)}
            </Select>
            {selectedCustomer &&
            <p className="mt-1 flex items-center gap-1.5 text-xs text-text-gray dark:text-slate-400">
                {selectedCustomer.registrationType === 'dealer' && <Badge tone="purple">Dealer</Badge>}
                {selectedCustomer.email}{selectedCustomer.phone ? ` · ${selectedCustomer.phone}` : ''}
              </p>
            }
          </div>
          <div>
            <Label htmlFor="inv-due">Due date (optional)</Label>
            <Input id="inv-due" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} placeholder="Auto-calculated from the customer's credit period" />
            <p className="mt-1 text-xs text-text-gray dark:text-slate-400">Left blank, this is calculated automatically from the customer's credit period.</p>
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
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title={editTarget ? `Edit invoice — ${editTarget.invoiceNumber}` : 'Edit invoice'}
        size="xl"
        footer={
        <>
            <Button variant="secondary" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button onClick={saveEdit} loading={editSaving}>Save changes</Button>
          </>
        }>

        {editTarget &&
        <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="edit-vehicle">Vehicle</Label>
                <Input id="edit-vehicle" value={editForm.vehicle} onChange={(e) => setEditForm((f) => ({ ...f, vehicle: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="edit-plate">License plate</Label>
                <Input id="edit-plate" value={editForm.plate} onChange={(e) => setEditForm((f) => ({ ...f, plate: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="edit-due">Due date</Label>
                <Input id="edit-due" type="date" value={editForm.dueDate} onChange={(e) => setEditForm((f) => ({ ...f, dueDate: e.target.value }))} />
              </div>
            </div>

            <div className="mt-4">
              <Label>Line items</Label>
              {editableItems(editTarget) ?
            <>
                  <div className="space-y-2">
                    {editItems.map((it, i) =>
                <div key={i} className="grid grid-cols-12 gap-2">
                        <Input className="col-span-6" placeholder="Description" value={it.description} onChange={(e) => updateEditItem(i, { description: e.target.value })} />
                        <Input className="col-span-2" type="number" placeholder="Qty" value={it.quantity} onChange={(e) => updateEditItem(i, { quantity: Number(e.target.value) })} />
                        <Input className="col-span-3" type="number" placeholder="Unit price" value={it.unitPrice} onChange={(e) => updateEditItem(i, { unitPrice: Number(e.target.value) })} />
                        <button type="button" onClick={() => removeEditItem(i)} className="col-span-1 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40">
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                )}
                  </div>
                  <button type="button" onClick={addEditItem} className="mt-2 flex items-center gap-1 text-xs font-semibold text-royal hover:underline dark:text-blue-300">
                    <PlusIcon className="h-3.5 w-3.5" /> Add line
                  </button>
                </> :

            <p className="rounded-lg border border-border-soft bg-soft-gray px-3 py-2 text-sm text-text-gray dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400">
                  Items are locked once an invoice is {editTarget.status} — only vehicle, plate, due date, and notes can be edited here.
                </p>
            }
            </div>

            <div className="mt-4">
              <Label htmlFor="edit-notes">Notes</Label>
              <Textarea id="edit-notes" value={editForm.notes} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </>
        }
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
            {payMethod === 'Cheque' &&
          <div>
                <Label htmlFor="pay-cheque">Cheque number</Label>
                <Input id="pay-cheque" value={payChequeNumber} onChange={(e) => setPayChequeNumber(e.target.value)} placeholder="e.g. 000123" />
              </div>
          }
            {(payMethod === 'Cheque' || payMethod === 'Bank Transfer' || payMethod === 'Card') && bankAccounts.length > 0 &&
          <div>
                <Label htmlFor="pay-bank">Bank account {payMethod === 'Card' ? '' : '(optional)'}</Label>
                <Select id="pay-bank" value={payBankAccountId} onChange={(e) => setPayBankAccountId(e.target.value)}>
                  <option value="">— none —</option>
                  {bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.bankName} · {b.accountNumber}</option>)}
                </Select>
                {payMethod === 'Card' && payBankAccountId &&
            (() => {
              const bank = bankAccounts.find((b) => b.id === payBankAccountId);
              if (!bank) return null;
              const settleDate = new Date(Date.now() + bank.cardSettlementDays * 24 * 60 * 60 * 1000);
              return (
                <p className="mt-1 text-xs text-text-gray dark:text-slate-400">
                  Estimated settlement: {formatDate(settleDate.toISOString())} ({bank.cardSettlementDays} day{bank.cardSettlementDays === 1 ? '' : 's'})
                </p>);

            })()
            }
              </div>
          }
          </div>
        }
      </Modal>

      <Modal
        open={quickCustomerOpen}
        onClose={() => setQuickCustomerOpen(false)}
        title="New customer"
        footer={
        <>
            <Button variant="secondary" onClick={() => setQuickCustomerOpen(false)}>Cancel</Button>
            <Button onClick={saveQuickCustomer} loading={quickCustomerSaving}>Add customer</Button>
          </>
        }>

        <div className="space-y-4">
          <div>
            <Label htmlFor="qc-name">Full name</Label>
            <Input id="qc-name" required value={quickCustomerForm.name} onChange={(e) => setQuickCustomerForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="qc-email">Email</Label>
            <Input id="qc-email" type="email" required value={quickCustomerForm.email} onChange={(e) => setQuickCustomerForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="qc-phone">Phone</Label>
            <Input id="qc-phone" value={quickCustomerForm.phone} onChange={(e) => setQuickCustomerForm((f) => ({ ...f, phone: e.target.value }))} />
          </div>
          <p className="text-xs text-text-gray dark:text-slate-400">
            For dealer registration or fuller customer details, use the Customers page instead — this quick form covers the basics needed to invoice right away.
          </p>
        </div>
      </Modal>
    </div>);

}

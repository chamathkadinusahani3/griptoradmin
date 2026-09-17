import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PiggyBankIcon, PlusIcon, XIcon, ArrowDownLeftIcon, ArrowUpRightIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { StatusBadge } from '../../components/StatusBadge';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Label, Textarea } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { AdvancePayment, AdvancePaymentDirection, AdvancePaymentMethod, ADVANCE_PAYMENT_METHODS, AdvancePaymentStatus, ADVANCE_PAYMENT_STATUSES } from '../../types/advancePayment';
import { Customer } from '../../types/customer';
import { Supplier } from '../../types/supplier';
import { BankAccount } from '../../types/bankAccount';
import { formatCurrency, formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

const STATUS_FILTERS: ('All' | AdvancePaymentStatus)[] = ['All', ...ADVANCE_PAYMENT_STATUSES];

export function AdvancePayments() {
  const [payments, setPayments] = useState<AdvancePayment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'All' | AdvancePaymentStatus>('All');

  const [modalOpen, setModalOpen] = useState(false);
  const [direction, setDirection] = useState<AdvancePaymentDirection>('customer');
  const [partyId, setPartyId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<AdvancePaymentMethod>('Cash');
  const [chequeNumber, setChequeNumber] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const [voidTarget, setVoidTarget] = useState<AdvancePayment | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voiding, setVoiding] = useState(false);

  const load = () => {
    setLoading(true);
    api
      .get<{ advancePayments: AdvancePayment[] }>('/advance-payments')
      .then(({ advancePayments }) => setPayments(advancePayments))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load advance payments'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);
  useEffect(() => {
    api.get<{ customers: Customer[] }>('/customers').then(({ customers }) => setCustomers(customers)).catch(() => setCustomers([]));
    api.get<{ suppliers: Supplier[] }>('/suppliers').then(({ suppliers }) => setSuppliers(suppliers)).catch(() => setSuppliers([]));
    api.get<{ bankAccounts: BankAccount[] }>('/bank-accounts').then(({ bankAccounts }) => setBankAccounts(bankAccounts)).catch(() => setBankAccounts([]));
  }, []);

  const filtered = statusFilter === 'All' ? payments : payments.filter((p) => p.status === statusFilter);

  const openCreate = () => {
    setDirection('customer');
    setPartyId('');
    setAmount('');
    setMethod('Cash');
    setChequeNumber('');
    setBankAccountId('');
    setDate(new Date().toISOString().slice(0, 10));
    setNotes('');
    setModalOpen(true);
  };

  const save = async () => {
    if (!partyId || !amount || Number(amount) <= 0 || !method) {
      toast.error(`${direction === 'customer' ? 'Customer' : 'Supplier'}, a positive amount, and a method are required`);
      return;
    }
    if (method === 'Cheque' && !chequeNumber.trim()) {
      toast.error('Enter the cheque number');
      return;
    }
    setSaving(true);
    try {
      const { advancePayment } = await api.post<{ advancePayment: AdvancePayment }>('/advance-payments', {
        direction,
        customerId: direction === 'customer' ? partyId : undefined,
        supplierId: direction === 'supplier' ? partyId : undefined,
        amount: Number(amount),
        method,
        chequeNumber: method === 'Cheque' ? chequeNumber.trim() : undefined,
        bankAccountId: bankAccountId || undefined,
        date,
        notes: notes || undefined,
      });
      setPayments((prev) => [advancePayment, ...prev]);
      toast.success(`${advancePayment.advancePaymentNumber} recorded`);
      setModalOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to record advance payment');
    } finally {
      setSaving(false);
    }
  };

  const submitVoid = async () => {
    if (!voidTarget || !voidReason.trim()) {
      toast.error('A reason is required');
      return;
    }
    setVoiding(true);
    try {
      const { advancePayment } = await api.patch<{ advancePayment: AdvancePayment }>(`/advance-payments/${voidTarget.id}`, { action: 'void', reason: voidReason });
      setPayments((prev) => prev.map((p) => (p.id === advancePayment.id ? advancePayment : p)));
      toast.success(`${advancePayment.advancePaymentNumber} voided`);
      setVoidTarget(null);
      setVoidReason('');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to void advance payment');
    } finally {
      setVoiding(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Advance Payments"
        description="Money received from a customer, or paid to a supplier, before any invoice or purchase order exists."
        action={<Button onClick={openCreate} disabled={customers.length === 0 && suppliers.length === 0}><PlusIcon className="h-4 w-4" /> New advance</Button>} />

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
      <Card><EmptyState icon={PiggyBankIcon} title="No advance payments" description="Record money received or paid before any invoice/PO exists." /></Card> :

      <Card>
          <ul className="divide-y divide-border-soft dark:divide-slate-800">
            {filtered.map((p) =>
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-navy dark:text-slate-100">{p.advancePaymentNumber}</p>
                    <Badge tone={p.direction === 'customer' ? 'green' : 'amber'}>
                      {p.direction === 'customer' ? <ArrowDownLeftIcon className="h-3 w-3" /> : <ArrowUpRightIcon className="h-3 w-3" />}
                      {p.direction === 'customer' ? 'From customer' : 'To supplier'}
                    </Badge>
                    <StatusBadge status={p.status} />
                  </div>
                  <p className="mt-1 text-xs text-text-gray dark:text-slate-400">
                    {p.customerName ?? p.supplierName} · {p.method} · {formatDate(p.date)}
                  </p>
                  {p.appliedAmount > 0 && <p className="mt-1 text-xs text-text-gray dark:text-slate-400">Applied: {formatCurrency(p.appliedAmount)} · Remaining: {formatCurrency(p.remainingAmount)}</p>}
                  {p.status === 'Void' && p.voidReason && <p className="mt-1 text-xs text-text-gray dark:text-slate-500">{p.voidReason}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="teal">{formatCurrency(p.amount)}</Badge>
                  {p.status === 'Open' && p.appliedAmount === 0 &&
              <Button size="sm" variant="ghost" onClick={() => { setVoidTarget(p); setVoidReason(''); }}><XIcon className="h-3.5 w-3.5" /> Void</Button>
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
        title="New advance payment"
        footer={
        <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={save} loading={saving}>Record advance</Button>
          </>
        }>

        <div className="space-y-4">
          <div>
            <Label htmlFor="adv-direction">Direction</Label>
            <Select id="adv-direction" value={direction} onChange={(e) => { setDirection(e.target.value as AdvancePaymentDirection); setPartyId(''); }}>
              <option value="customer">From a customer (they paid us early)</option>
              <option value="supplier">To a supplier (we paid them early)</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="adv-party">{direction === 'customer' ? 'Customer' : 'Supplier'}</Label>
            <Select id="adv-party" value={partyId} onChange={(e) => setPartyId(e.target.value)}>
              <option value="">— select —</option>
              {(direction === 'customer' ? customers : suppliers).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="adv-amount">Amount</Label>
              <Input id="adv-amount" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="adv-date">Date</Label>
              <Input id="adv-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="adv-method">Method</Label>
            <Select id="adv-method" value={method} onChange={(e) => setMethod(e.target.value as AdvancePaymentMethod)}>
              {ADVANCE_PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </Select>
          </div>
          {method === 'Cheque' &&
          <div>
              <Label htmlFor="adv-cheque">Cheque number</Label>
              <Input id="adv-cheque" value={chequeNumber} onChange={(e) => setChequeNumber(e.target.value)} placeholder="e.g. 000123" />
            </div>
          }
          {(method === 'Cheque' || method === 'Bank Transfer') && bankAccounts.length > 0 &&
          <div>
              <Label htmlFor="adv-bank">Bank account (optional)</Label>
              <Select id="adv-bank" value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
                <option value="">— none —</option>
                {bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.bankName} · {b.accountNumber}</option>)}
              </Select>
            </div>
          }
          <div>
            <Label htmlFor="adv-notes">Notes (optional)</Label>
            <Textarea id="adv-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
      </Modal>

      <Modal
        open={!!voidTarget}
        onClose={() => setVoidTarget(null)}
        title={voidTarget ? `Void ${voidTarget.advancePaymentNumber}` : 'Void advance payment'}
        footer={
        <>
            <Button variant="secondary" onClick={() => setVoidTarget(null)}>Cancel</Button>
            <Button onClick={submitVoid} loading={voiding}>Void</Button>
          </>
        }>
        <div>
          <Label htmlFor="void-reason">Reason</Label>
          <Textarea id="void-reason" required value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="e.g. Entered in error" />
        </div>
      </Modal>
    </div>);

}

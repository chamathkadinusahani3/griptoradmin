import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { HandCoinsIcon, PlusIcon, TrashIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Label, Textarea } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { Receipt, ReceiptMethod, RECEIPT_METHODS } from '../../types/receipt';
import { Customer } from '../../types/customer';
import { CustomerInvoice } from '../../types/customerInvoice';
import { BankAccount } from '../../types/bankAccount';
import { formatCurrency, formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

interface AllocationRow {
  invoiceId: string;
  amount: string;
}

export function Receipts() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<CustomerInvoice[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<ReceiptMethod>('Cash');
  const [chequeNumber, setChequeNumber] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');
  const [allocations, setAllocations] = useState<AllocationRow[]>([]);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api
      .get<{ receipts: Receipt[] }>('/receipts')
      .then(({ receipts }) => setReceipts(receipts))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load receipts'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);
  useEffect(() => {
    api.get<{ customers: Customer[] }>('/customers').then(({ customers }) => setCustomers(customers)).catch(() => setCustomers([]));
    api.get<{ invoices: CustomerInvoice[] }>('/customer-invoices').then(({ invoices }) => setInvoices(invoices)).catch(() => setInvoices([]));
    api.get<{ bankAccounts: BankAccount[] }>('/bank-accounts').then(({ bankAccounts }) => setBankAccounts(bankAccounts)).catch(() => setBankAccounts([]));
  }, []);

  const openCustomerInvoices = useMemo(
    () => invoices.filter((inv) => inv.customerId === customerId && inv.status !== 'Void' && inv.balance > 0),
    [invoices, customerId]
  );

  const openCreate = () => {
    setCustomerId('');
    setAmount('');
    setMethod('Cash');
    setChequeNumber('');
    setBankAccountId('');
    setDate(new Date().toISOString().slice(0, 10));
    setNotes('');
    setAllocations([]);
    setModalOpen(true);
  };

  const addAllocation = () => {
    const next = openCustomerInvoices.find((inv) => !allocations.some((a) => a.invoiceId === inv.id));
    if (!next) return;
    setAllocations((prev) => [...prev, { invoiceId: next.id, amount: '' }]);
  };
  const updateAllocation = (i: number, patch: Partial<AllocationRow>) => setAllocations((prev) => prev.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  const removeAllocation = (i: number) => setAllocations((prev) => prev.filter((_, idx) => idx !== i));

  const allocatedTotal = allocations.reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
  const onAccountPreview = Math.max(0, (Number(amount) || 0) - allocatedTotal);

  const save = async () => {
    if (!customerId || !amount || Number(amount) <= 0 || !method) {
      toast.error('Customer, a positive amount, and a method are required');
      return;
    }
    if (method === 'Cheque' && !chequeNumber.trim()) {
      toast.error('Enter the cheque number');
      return;
    }
    if (allocatedTotal > Number(amount)) {
      toast.error('Allocations cannot exceed the receipt amount');
      return;
    }
    setSaving(true);
    try {
      const { receipt } = await api.post<{ receipt: Receipt }>('/receipts', {
        customerId,
        amount: Number(amount),
        method,
        chequeNumber: method === 'Cheque' ? chequeNumber.trim() : undefined,
        bankAccountId: bankAccountId || undefined,
        date,
        notes: notes || undefined,
        allocations: allocations.filter((a) => a.invoiceId && Number(a.amount) > 0).map((a) => ({ invoiceId: a.invoiceId, amount: Number(a.amount) })),
      });
      setReceipts((prev) => [receipt, ...prev]);
      toast.success(`${receipt.receiptNumber} recorded`);
      setModalOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to record receipt');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Receipts"
        description="Record a customer payment and allocate it across one or more open invoices — anything left over stays on account."
        action={<Button onClick={openCreate} disabled={customers.length === 0}><PlusIcon className="h-4 w-4" /> New receipt</Button>} />

      {loading ?
      <Card><div className="space-y-3 p-5">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div></Card> :
      receipts.length === 0 ?
      <Card><EmptyState icon={HandCoinsIcon} title="No receipts yet" description="Record a customer payment to see it here." /></Card> :

      <Card>
          <ul className="divide-y divide-border-soft dark:divide-slate-800">
            {receipts.map((r) =>
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-navy dark:text-slate-100">{r.receiptNumber}</p>
                    <Badge tone="gray">{r.method}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-text-gray dark:text-slate-400">{r.customerName ?? r.customerId} · {formatDate(r.date)}</p>
                  {r.allocations.length > 0 &&
              <p className="mt-1 text-xs text-text-gray dark:text-slate-400">
                      Applied to {r.allocations.map((a) => `${a.invoiceNumber ?? a.invoiceId} (${formatCurrency(a.amount)})`).join(', ')}
                    </p>
              }
                  {r.onAccountAmount > 0 && <p className="mt-1 text-xs text-teal">On account: {formatCurrency(r.onAccountAmount)}</p>}
                </div>
                <Badge tone="teal">{formatCurrency(r.amount)}</Badge>
              </li>
          )}
          </ul>
        </Card>
      }

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="New receipt"
        size="lg"
        footer={
        <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={save} loading={saving}>Record receipt</Button>
          </>
        }>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="rcpt-customer">Customer</Label>
            <Select id="rcpt-customer" value={customerId} onChange={(e) => { setCustomerId(e.target.value); setAllocations([]); }}>
              <option value="">— select —</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="rcpt-amount">Amount</Label>
            <Input id="rcpt-amount" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="rcpt-method">Method</Label>
            <Select id="rcpt-method" value={method} onChange={(e) => setMethod(e.target.value as ReceiptMethod)}>
              {RECEIPT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="rcpt-date">Date</Label>
            <Input id="rcpt-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          {method === 'Cheque' &&
          <div>
              <Label htmlFor="rcpt-cheque">Cheque number</Label>
              <Input id="rcpt-cheque" value={chequeNumber} onChange={(e) => setChequeNumber(e.target.value)} placeholder="e.g. 000123" />
            </div>
          }
          {(method === 'Cheque' || method === 'Bank Transfer') && bankAccounts.length > 0 &&
          <div>
              <Label htmlFor="rcpt-bank">Bank account (optional)</Label>
              <Select id="rcpt-bank" value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
                <option value="">— none —</option>
                {bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.bankName} · {b.accountNumber}</option>)}
              </Select>
            </div>
          }
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between">
            <Label>Apply to invoices (optional)</Label>
            {customerId && allocations.length < openCustomerInvoices.length &&
            <button type="button" onClick={addAllocation} className="flex items-center gap-1 text-xs font-semibold text-royal hover:underline dark:text-blue-300">
                <PlusIcon className="h-3.5 w-3.5" /> Add allocation
              </button>
            }
          </div>
          {!customerId ?
          <p className="mt-1 text-xs text-text-gray dark:text-slate-400">Pick a customer to see their open invoices.</p> :
          openCustomerInvoices.length === 0 ?
          <p className="mt-1 text-xs text-text-gray dark:text-slate-400">No open invoices for this customer — the full amount will go on account.</p> :

          <div className="mt-2 space-y-2">
              {allocations.map((a, i) =>
            <div key={i} className="grid grid-cols-12 gap-2">
                  <Select
                className="col-span-7"
                value={a.invoiceId}
                onChange={(e) => updateAllocation(i, { invoiceId: e.target.value })}>

                    {openCustomerInvoices.map((inv) => <option key={inv.id} value={inv.id}>{inv.invoiceNumber} — balance {formatCurrency(inv.balance)}</option>)}
                  </Select>
                  <Input className="col-span-4" type="number" min={0} placeholder="Amount" value={a.amount} onChange={(e) => updateAllocation(i, { amount: e.target.value })} />
                  <button type="button" onClick={() => removeAllocation(i)} className="col-span-1 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40">
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
            )}
            </div>
          }
          {allocations.length > 0 &&
          <p className="mt-2 text-right text-xs text-text-gray dark:text-slate-400">
              Allocated: {formatCurrency(allocatedTotal)} · On account: {formatCurrency(onAccountPreview)}
            </p>
          }
        </div>

        <div className="mt-4">
          <Label htmlFor="rcpt-notes">Notes (optional)</Label>
          <Textarea id="rcpt-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </Modal>
    </div>);

}

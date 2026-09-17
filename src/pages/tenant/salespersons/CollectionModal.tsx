import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input, Select, Label, Textarea } from '../../../components/ui/Input';
import { CollectionRecord, COLLECTION_METHODS, CollectionMethod } from '../../../types/collectionRecord';
import { CustomerInvoice } from '../../../types/customerInvoice';
import { BankAccount } from '../../../types/bankAccount';
import { api, ApiError } from '../../../lib/api';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function CollectionModal({
  salespersonId,
  customerId,
  customerName,
  visitId,
  onClose,
  onRecorded




}: {salespersonId: string;customerId: string;customerName?: string;visitId?: string;onClose: () => void;onRecorded: (c: CollectionRecord) => void;}) {
  const [invoices, setInvoices] = useState<CustomerInvoice[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    invoiceId: '',
    amount: '',
    method: 'Cash' as CollectionMethod,
    chequeNumber: '',
    bankAccountId: '',
    date: todayIso(),
    notes: ''
  });

  useEffect(() => {
    api.get<{ invoices: CustomerInvoice[] }>('/customer-invoices').then(({ invoices }) => setInvoices(invoices.filter((i) => i.customerId === customerId && i.balance > 0))).catch(() => setInvoices([]));
    api.get<{ bankAccounts: BankAccount[] }>('/bank-accounts').then(({ bankAccounts }) => setBankAccounts(bankAccounts)).catch(() => setBankAccounts([]));
  }, [customerId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (form.method === 'Cheque' && !form.chequeNumber.trim()) {
      toast.error('A cheque number is required');
      return;
    }
    setSaving(true);
    try {
      const { collection } = await api.post<{ collection: CollectionRecord }>('/collections', {
        salespersonId,
        customerId,
        visitId: visitId || undefined,
        invoiceId: form.invoiceId || undefined,
        amount: Number(form.amount),
        method: form.method,
        chequeNumber: form.method === 'Cheque' ? form.chequeNumber.trim() : undefined,
        bankAccountId: form.bankAccountId || undefined,
        date: form.date,
        notes: form.notes || undefined
      });
      onRecorded(collection);
      toast.success('Collection recorded');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to record collection');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Record collection${customerName ? ` — ${customerName}` : ''}`}
      size="lg"
      footer={
      <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button form="collection-form" type="submit" loading={saving}>Record collection</Button>
        </>
      }>

      <form id="collection-form" onSubmit={submit} className="space-y-4">
        {invoices.length > 0 &&
        <div>
            <Label htmlFor="col-invoice">Apply to invoice (optional)</Label>
            <Select id="col-invoice" value={form.invoiceId} onChange={(e) => setForm((f) => ({ ...f, invoiceId: e.target.value }))}>
              <option value="">— general collection, not tied to an invoice —</option>
              {invoices.map((inv) => <option key={inv.id} value={inv.id}>{inv.invoiceNumber} — balance {inv.balance.toLocaleString()}</option>)}
            </Select>
          </div>
        }
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="col-amount">Amount</Label>
            <Input id="col-amount" type="number" min={0} value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="col-date">Date</Label>
            <Input id="col-date" type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="col-method">Payment method</Label>
            <Select id="col-method" value={form.method} onChange={(e) => setForm((f) => ({ ...f, method: e.target.value as CollectionMethod }))}>
              {COLLECTION_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </Select>
          </div>
          {form.method === 'Cheque' &&
          <div>
              <Label htmlFor="col-cheque">Cheque number</Label>
              <Input id="col-cheque" value={form.chequeNumber} onChange={(e) => setForm((f) => ({ ...f, chequeNumber: e.target.value }))} />
            </div>
          }
        </div>
        {form.method !== 'Cash' && bankAccounts.length > 0 &&
        <div>
            <Label htmlFor="col-bank">Bank account (optional)</Label>
            <Select id="col-bank" value={form.bankAccountId} onChange={(e) => setForm((f) => ({ ...f, bankAccountId: e.target.value }))}>
              <option value="">— none —</option>
              {bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.bankName} — {b.accountNumber}</option>)}
            </Select>
          </div>
        }
        <div>
          <Label htmlFor="col-notes">Notes (optional)</Label>
          <Textarea id="col-notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
        </div>
      </form>
    </Modal>);

}

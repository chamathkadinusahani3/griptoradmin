import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { RotateCcwIcon, PlusIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Toggle } from '../../components/ui/Toggle';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Textarea, Label } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { Return, ReturnDirection, ReturnRefundMethod } from '../../types/return';
import { Sale } from '../../types/sale';
import { PurchaseOrder } from '../../types/purchaseOrder';
import { BankAccount } from '../../types/bankAccount';
import { formatCurrency, formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

const DIRECTION_FILTERS: ('All' | ReturnDirection)[] = ['All', 'customer', 'supplier'];
const DIRECTION_LABEL: Record<ReturnDirection, string> = { customer: 'From customer', supplier: 'To supplier' };
const REFUND_METHODS: ReturnRefundMethod[] = ['Cash', 'Card', 'Bank Transfer', 'Cheque', 'Other'];

interface DraftLine {
  partId: string;
  name: string;
  available: number;
  quantity: string;
}

export function Returns() {
  const [returns, setReturns] = useState<Return[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [receivedOrders, setReceivedOrders] = useState<PurchaseOrder[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [directionFilter, setDirectionFilter] = useState<'All' | ReturnDirection>('All');

  const [modalOpen, setModalOpen] = useState(false);
  const [direction, setDirection] = useState<ReturnDirection>('customer');
  const [sourceId, setSourceId] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [wantRefund, setWantRefund] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundMethod, setRefundMethod] = useState<ReturnRefundMethod>('Cash');
  const [chequeNumber, setChequeNumber] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');
  const [saving, setSaving] = useState(false);

  const loadReturns = () => {
    setLoading(true);
    api
      .get<{ returns: Return[] }>('/returns')
      .then(({ returns }) => setReturns(returns))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load returns'))
      .finally(() => setLoading(false));
  };

  useEffect(loadReturns, []);

  useEffect(() => {
    api.get<{ sales: Sale[] }>('/sales').then(({ sales }) => setSales(sales)).catch(() => setSales([]));
    api
      .get<{ purchaseOrders: PurchaseOrder[] }>('/purchase-orders?status=Received')
      .then(({ purchaseOrders }) => setReceivedOrders(purchaseOrders))
      .catch(() => setReceivedOrders([]));
    api.get<{ bankAccounts: BankAccount[] }>('/bank-accounts').then(({ bankAccounts }) => setBankAccounts(bankAccounts)).catch(() => setBankAccounts([]));
  }, []);

  const openCreate = () => {
    setDirection('customer');
    setSourceId('');
    setLines([]);
    setReason('');
    setNotes('');
    setWantRefund(false);
    setRefundAmount('');
    setRefundMethod('Cash');
    setChequeNumber('');
    setBankAccountId('');
    setModalOpen(true);
  };

  const selectSource = (id: string) => {
    setSourceId(id);
    if (direction === 'customer') {
      const sale = sales.find((s) => s.id === id);
      setLines(sale ? sale.items.map((i) => ({ partId: i.partId, name: i.name, available: i.qty, quantity: '' })) : []);
    } else {
      const order = receivedOrders.find((o) => o.id === id);
      setLines(order ? order.items.map((i) => ({ partId: i.partId, name: i.name, available: i.quantity, quantity: '' })) : []);
    }
  };

  const changeDirection = (next: ReturnDirection) => {
    setDirection(next);
    setSourceId('');
    setLines([]);
  };

  const updateLineQty = (partId: string, quantity: string) => {
    setLines((prev) => prev.map((l) => (l.partId === partId ? { ...l, quantity } : l)));
  };

  const activeLines = lines.filter((l) => Number(l.quantity) > 0);

  const save = async () => {
    if (!sourceId || activeLines.length === 0) {
      toast.error('Pick a source and at least one item quantity to return');
      return;
    }
    if (!reason.trim()) {
      toast.error('A reason is required');
      return;
    }
    if (wantRefund) {
      const amount = Number(refundAmount);
      if (!amount || amount <= 0) {
        toast.error('Enter a valid refund amount');
        return;
      }
      if (refundMethod === 'Cheque' && !chequeNumber.trim()) {
        toast.error('Enter the cheque number');
        return;
      }
    }
    setSaving(true);
    try {
      const { return: created } = await api.post<{ return: Return }>('/returns', {
        direction,
        sourceId,
        items: activeLines.map((l) => ({ partId: l.partId, quantity: Number(l.quantity) })),
        reason: reason.trim(),
        notes: notes || undefined,
        refundAmount: wantRefund ? Number(refundAmount) : undefined,
        refundMethod: wantRefund ? refundMethod : undefined,
        chequeNumber: wantRefund && refundMethod === 'Cheque' ? chequeNumber.trim() : undefined,
        bankAccountId: wantRefund ? bankAccountId || undefined : undefined,
      });
      setReturns((prev) => [created, ...prev]);
      toast.success(`${created.returnNumber} recorded`);
      setModalOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to record return');
    } finally {
      setSaving(false);
    }
  };

  const sourceOptions = useMemo(
    () =>
      direction === 'customer'
        ? sales.map((s) => ({ id: s.id, label: `Sale — ${formatDate(s.date)} — ${formatCurrency(s.total)}` }))
        : receivedOrders.map((o) => ({ id: o.id, label: `${o.poNumber} — ${o.supplier ?? 'Unknown supplier'}` })),
    [direction, sales, receivedOrders]
  );
  const noPrereqs = direction === 'customer' ? sales.length === 0 : receivedOrders.length === 0;

  const filtered = directionFilter === 'All' ? returns : returns.filter((r) => r.direction === directionFilter);

  return (
    <div>
      <PageHeader
        title="Returns"
        description="Customer returns and supplier returns, both reversing real stock."
        action={<Button onClick={openCreate}><PlusIcon className="h-4 w-4" /> New return</Button>} />


      <div className="mb-4 flex flex-wrap gap-2">
        {DIRECTION_FILTERS.map((d) =>
        <button
          key={d}
          onClick={() => setDirectionFilter(d)}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${directionFilter === d ? 'bg-griptor-gradient text-white' : 'bg-soft-gray text-text-gray hover:bg-light-blue dark:bg-slate-800 dark:text-slate-300'}`}>

            {d === 'All' ? 'All' : DIRECTION_LABEL[d]}
          </button>
        )}
      </div>

      {loading ?
      <Card><div className="p-5"><TableSkeleton rows={5} /></div></Card> :
      filtered.length === 0 ?
      <Card><EmptyState icon={RotateCcwIcon} title="No returns yet" description="Record a customer or supplier return here." /></Card> :

      <Card>
          <ul className="divide-y divide-border-soft dark:divide-slate-800">
            {filtered.map((r) =>
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-navy dark:text-slate-100">{r.returnNumber}</p>
                    <Badge tone={r.direction === 'customer' ? 'amber' : 'blue'}>{DIRECTION_LABEL[r.direction]}</Badge>
                    {r.refundAmount && <Badge tone={r.reconciled ? 'green' : 'gray'}>{r.reconciled ? 'Reconciled' : 'Refund pending'}</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-text-gray dark:text-slate-400">
                    {r.party ?? r.reference ?? ''} · {r.items.length} item{r.items.length === 1 ? '' : 's'} · {r.reason}
                  </p>
                  <p className="mt-1 text-xs text-text-gray dark:text-slate-400">{formatDate(r.createdAt)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="teal">{formatCurrency(r.totalAmount)}</Badge>
                  {r.refundAmount != null &&
              <span className="text-xs text-text-gray dark:text-slate-400">Refund: {formatCurrency(r.refundAmount)} ({r.refundMethod})</span>
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
        title="New return"
        size="xl"
        footer={
        <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={save} loading={saving}>Record return</Button>
          </>
        }>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="ret-direction">Direction</Label>
            <Select id="ret-direction" value={direction} onChange={(e) => changeDirection(e.target.value as ReturnDirection)}>
              <option value="customer">Customer returning to us</option>
              <option value="supplier">We're returning to a supplier</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="ret-source">{direction === 'customer' ? 'Sale' : 'Purchase order'}</Label>
            <Select id="ret-source" value={sourceId} onChange={(e) => selectSource(e.target.value)} disabled={noPrereqs}>
              <option value="">— select —</option>
              {sourceOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </Select>
            {noPrereqs &&
            <p className="mt-1 text-xs text-text-gray dark:text-slate-400">
                {direction === 'customer' ? 'No sales recorded yet.' : 'No Received purchase orders yet.'}
              </p>
            }
          </div>
        </div>

        {lines.length > 0 &&
        <div className="mt-4">
            <Label>Items to return</Label>
            <div className="space-y-2">
              {lines.map((l) =>
            <div key={l.partId} className="grid grid-cols-12 items-center gap-2">
                  <span className="col-span-7 truncate text-sm text-navy dark:text-slate-200">{l.name}</span>
                  <span className="col-span-2 text-xs text-text-gray dark:text-slate-400">of {l.available}</span>
                  <Input
                className="col-span-3"
                type="number"
                min={0}
                max={l.available}
                placeholder="Qty"
                value={l.quantity}
                onChange={(e) => updateLineQty(l.partId, e.target.value)} />

                </div>
            )}
            </div>
          </div>
        }

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="ret-reason">Reason</Label>
            <Input id="ret-reason" required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Defective, wrong item" />
          </div>
          <div>
            <Label htmlFor="ret-notes">Notes (optional)</Label>
            <Textarea id="ret-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between rounded-xl border border-border-soft p-3 dark:border-slate-800">
          <div>
            <Label>Record a refund/credit</Label>
            <p className="text-xs text-text-gray dark:text-slate-400">
              {direction === 'customer' ? 'Cash handed back to the customer.' : 'Credit or cash received from the supplier.'}
            </p>
          </div>
          <Toggle checked={wantRefund} onChange={setWantRefund} />
        </div>

        {wantRefund &&
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="ret-refund-amount">Amount</Label>
              <Input id="ret-refund-amount" type="number" min={0} value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="ret-refund-method">Method</Label>
              <Select id="ret-refund-method" value={refundMethod} onChange={(e) => setRefundMethod(e.target.value as ReturnRefundMethod)}>
                {REFUND_METHODS.map((m) => <option key={m}>{m}</option>)}
              </Select>
            </div>
            {refundMethod === 'Cheque' &&
          <div>
                <Label htmlFor="ret-cheque">Cheque number</Label>
                <Input id="ret-cheque" value={chequeNumber} onChange={(e) => setChequeNumber(e.target.value)} placeholder="e.g. 000123" />
              </div>
          }
            {(refundMethod === 'Cheque' || refundMethod === 'Bank Transfer') && bankAccounts.length > 0 &&
          <div>
                <Label htmlFor="ret-bank">Bank account (optional)</Label>
                <Select id="ret-bank" value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
                  <option value="">— none —</option>
                  {bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.bankName} · {b.accountNumber}</option>)}
                </Select>
              </div>
          }
          </div>
        }
      </Modal>
    </div>);

}

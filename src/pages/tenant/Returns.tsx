import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { RotateCcwIcon, PlusIcon, CheckIcon, XIcon, SearchCheckIcon, BanknoteIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { StatusBadge } from '../../components/StatusBadge';
import { SalesAttachmentsButton } from '../../components/SalesAttachments';
import { Toggle } from '../../components/ui/Toggle';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Textarea, Label } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { Return, ReturnDirection, ReturnRefundMethod, ReturnReason, RETURN_REASONS, ReturnStatus } from '../../types/return';
import { Sale } from '../../types/sale';
import { PurchaseOrder } from '../../types/purchaseOrder';
import { CustomerInvoice } from '../../types/customerInvoice';
import { BankAccount } from '../../types/bankAccount';
import { formatCurrency, formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

const DIRECTION_FILTERS: ('All' | ReturnDirection)[] = ['All', 'customer', 'supplier'];
const DIRECTION_LABEL: Record<ReturnDirection, string> = { customer: 'From customer', supplier: 'To supplier' };
const REFUND_METHODS: ReturnRefundMethod[] = ['Cash', 'Card', 'Bank Transfer', 'Cheque', 'Other'];
// Only meaningful when direction is 'customer' — a B2B dealer's purchases go
// through a CustomerInvoice, not a POS Sale, so returning against one needs
// its own source kind (Dealer Credit Control roadmap Module 1). See
// Return.ts's own comment for why this can't just reuse the Sale-sourced
// per-Part line shape (CustomerInvoice items carry no Part reference).
type CustomerSourceKind = 'sale' | 'customer-invoice';

interface DraftLine {
  partId: string;
  name: string;
  available: number;
  quantity: string;
}

interface InvoiceDraftLine {
  description: string;
  quantity: string;
  unitPrice: string;
}

export function Returns() {
  const [returns, setReturns] = useState<Return[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [receivedOrders, setReceivedOrders] = useState<PurchaseOrder[]>([]);
  const [invoices, setInvoices] = useState<CustomerInvoice[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [directionFilter, setDirectionFilter] = useState<'All' | ReturnDirection>('All');

  const [modalOpen, setModalOpen] = useState(false);
  const [direction, setDirection] = useState<ReturnDirection>('customer');
  const [sourceKind, setSourceKind] = useState<CustomerSourceKind>('sale');
  const [sourceId, setSourceId] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [invoiceLines, setInvoiceLines] = useState<InvoiceDraftLine[]>([]);
  const [reason, setReason] = useState<ReturnReason>(RETURN_REASONS[0]);
  const [notes, setNotes] = useState('');
  const [wantRefund, setWantRefund] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundMethod, setRefundMethod] = useState<ReturnRefundMethod>('Cash');
  const [chequeNumber, setChequeNumber] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'All' | ReturnStatus>('All');
  const [actingId, setActingId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Return | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);

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
    api.get<{ invoices: CustomerInvoice[] }>('/customer-invoices').then(({ invoices }) => setInvoices(invoices)).catch(() => setInvoices([]));
    api.get<{ bankAccounts: BankAccount[] }>('/bank-accounts').then(({ bankAccounts }) => setBankAccounts(bankAccounts)).catch(() => setBankAccounts([]));
  }, []);

  const openCreate = () => {
    setDirection('customer');
    setSourceKind('sale');
    setSourceId('');
    setLines([]);
    setInvoiceLines([]);
    setReason(RETURN_REASONS[0]);
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
    if (direction === 'supplier') {
      const order = receivedOrders.find((o) => o.id === id);
      setLines(order ? order.items.map((i) => ({ partId: i.partId, name: i.name, available: i.quantity, quantity: '' })) : []);
    } else if (sourceKind === 'sale') {
      const sale = sales.find((s) => s.id === id);
      setLines(sale ? sale.items.map((i) => ({ partId: i.partId, name: i.name, available: i.qty, quantity: '' })) : []);
    } else {
      // customer-invoice — no per-part cap to pre-fill from, staff describe
      // what's being returned directly (see Return.ts's comment).
      setInvoiceLines([{ description: '', quantity: '1', unitPrice: '' }]);
    }
  };

  const changeDirection = (next: ReturnDirection) => {
    setDirection(next);
    setSourceKind('sale');
    setSourceId('');
    setLines([]);
    setInvoiceLines([]);
  };

  const changeSourceKind = (next: CustomerSourceKind) => {
    setSourceKind(next);
    setSourceId('');
    setLines([]);
    setInvoiceLines(next === 'customer-invoice' ? [{ description: '', quantity: '1', unitPrice: '' }] : []);
  };

  const updateLineQty = (partId: string, quantity: string) => {
    setLines((prev) => prev.map((l) => (l.partId === partId ? { ...l, quantity } : l)));
  };

  const addInvoiceLine = () => setInvoiceLines((prev) => [...prev, { description: '', quantity: '1', unitPrice: '' }]);
  const updateInvoiceLine = (i: number, patch: Partial<InvoiceDraftLine>) =>
    setInvoiceLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const removeInvoiceLine = (i: number) => setInvoiceLines((prev) => prev.filter((_, idx) => idx !== i));

  const isInvoiceSourced = direction === 'customer' && sourceKind === 'customer-invoice';
  const activeLines = lines.filter((l) => Number(l.quantity) > 0);
  const activeInvoiceLines = invoiceLines.filter((l) => l.description.trim() && Number(l.quantity) > 0 && l.unitPrice !== '');

  const save = async () => {
    if (!sourceId || (isInvoiceSourced ? activeInvoiceLines.length === 0 : activeLines.length === 0)) {
      toast.error('Pick a source and at least one item to return');
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
        sourceType: isInvoiceSourced ? 'customer-invoice' : undefined,
        sourceId,
        items: isInvoiceSourced
          ? activeInvoiceLines.map((l) => ({ description: l.description.trim(), quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) }))
          : activeLines.map((l) => ({ partId: l.partId, quantity: Number(l.quantity) })),
        reason,
        notes: notes || undefined,
        refundAmount: wantRefund ? Number(refundAmount) : undefined,
        refundMethod: wantRefund ? refundMethod : undefined,
        chequeNumber: wantRefund && refundMethod === 'Cheque' ? chequeNumber.trim() : undefined,
        bankAccountId: wantRefund ? bankAccountId || undefined : undefined,
      });
      setReturns((prev) => [created, ...prev]);
      toast.success(`${created.returnNumber} recorded${isInvoiceSourced ? ' — credited straight to the invoice' : ''}`);
      setModalOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to record return');
    } finally {
      setSaving(false);
    }
  };

  const inspect = async (r: Return) => {
    setActingId(r.id);
    try {
      const { return: updated } = await api.patch<{ return: Return }>(`/returns/${r.id}`, { action: 'inspect' });
      setReturns((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      toast.success(`${updated.returnNumber} marked Inspected`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to inspect return');
    } finally {
      setActingId(null);
    }
  };

  const approve = async (r: Return) => {
    setActingId(r.id);
    try {
      const { return: updated } = await api.patch<{ return: Return }>(`/returns/${r.id}`, { action: 'approve' });
      setReturns((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      toast.success(`${updated.returnNumber} approved — stock and any refund have now moved`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to approve return');
    } finally {
      setActingId(null);
    }
  };

  const submitReject = async () => {
    if (!rejectTarget || !rejectReason.trim()) {
      toast.error('A reason is required');
      return;
    }
    setRejecting(true);
    try {
      const { return: updated } = await api.patch<{ return: Return }>(`/returns/${rejectTarget.id}`, { action: 'reject', reason: rejectReason });
      setReturns((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      toast.success(`${updated.returnNumber} rejected`);
      setRejectTarget(null);
      setRejectReason('');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to reject return');
    } finally {
      setRejecting(false);
    }
  };

  const approveRefund = async (r: Return) => {
    setActingId(r.id);
    try {
      const { return: updated } = await api.patch<{ return: Return }>(`/returns/${r.id}`, { action: 'approve-refund' });
      setReturns((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      toast.success(`Refund on ${updated.returnNumber} approved`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to approve refund');
    } finally {
      setActingId(null);
    }
  };

  const markRefundPaid = async (r: Return) => {
    setActingId(r.id);
    try {
      const { return: updated } = await api.patch<{ return: Return }>(`/returns/${r.id}`, { action: 'mark-refund-paid' });
      setReturns((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      toast.success(`Refund on ${updated.returnNumber} marked paid`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to mark refund as paid');
    } finally {
      setActingId(null);
    }
  };

  const sourceOptions = useMemo(
    () =>
      direction === 'supplier'
        ? receivedOrders.map((o) => ({ id: o.id, label: `${o.poNumber} — ${o.supplier ?? 'Unknown supplier'}` }))
        : sourceKind === 'sale'
        ? sales.map((s) => ({ id: s.id, label: `Sale — ${formatDate(s.date)} — ${formatCurrency(s.total)}` }))
        : invoices.map((i) => ({ id: i.id, label: `${i.invoiceNumber} — ${i.customer ?? 'Unknown customer'} — ${formatCurrency(i.total)}` })),
    [direction, sourceKind, sales, receivedOrders, invoices]
  );
  const noPrereqs =
    direction === 'supplier' ? receivedOrders.length === 0 : sourceKind === 'sale' ? sales.length === 0 : invoices.length === 0;

  const filtered = returns
    .filter((r) => directionFilter === 'All' || r.direction === directionFilter)
    .filter((r) => statusFilter === 'All' || r.status === statusFilter);

  return (
    <div>
      <PageHeader
        title="Returns"
        description="Customer returns and supplier returns, both reversing real stock."
        action={<Button onClick={openCreate}><PlusIcon className="h-4 w-4" /> New return</Button>} />


      <div className="mb-2 flex flex-wrap gap-2">
        {DIRECTION_FILTERS.map((d) =>
        <button
          key={d}
          onClick={() => setDirectionFilter(d)}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${directionFilter === d ? 'bg-griptor-gradient text-white' : 'bg-soft-gray text-text-gray hover:bg-light-blue dark:bg-slate-800 dark:text-slate-300'}`}>

            {d === 'All' ? 'All' : DIRECTION_LABEL[d]}
          </button>
        )}
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {(['All', 'Pending', 'Inspected', 'Approved', 'Rejected'] as const).map((s) =>
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
      <Card><EmptyState icon={RotateCcwIcon} title="No returns yet" description="Record a customer or supplier return here." /></Card> :

      <Card>
          <ul className="divide-y divide-border-soft dark:divide-slate-800">
            {filtered.map((r) =>
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-navy dark:text-slate-100">{r.returnNumber}</p>
                    <Badge tone={r.direction === 'customer' ? 'amber' : 'blue'}>{DIRECTION_LABEL[r.direction]}</Badge>
                    <StatusBadge status={r.status} />
                    {r.refundAmount != null && r.refundStatus &&
                <Badge tone={r.refundStatus === 'Paid' ? 'green' : r.refundStatus === 'Approved' ? 'blue' : 'amber'}>
                        Refund {r.refundStatus}
                      </Badge>
                }
                    {r.refundStatus === 'Paid' && <Badge tone={r.reconciled ? 'green' : 'gray'}>{r.reconciled ? 'Reconciled' : 'Not reconciled'}</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-text-gray dark:text-slate-400">
                    {r.party ?? r.reference ?? ''} · {r.items.length} item{r.items.length === 1 ? '' : 's'} · {r.reason}
                  </p>
                  <p className="mt-1 text-xs text-text-gray dark:text-slate-400">{formatDate(r.createdAt)}</p>
                  {r.status === 'Rejected' && r.rejectionReason && <p className="mt-1 text-xs text-text-gray dark:text-slate-500">Rejected: {r.rejectionReason}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="teal">{formatCurrency(r.totalAmount)}</Badge>
                  <SalesAttachmentsButton
                    docType="returns"
                    basePath={`/returns/${r.id}/attachments`}
                    attachments={r.attachments}
                    onChange={(next) => setReturns((prev) => prev.map((x) => (x.id === r.id ? { ...x, attachments: next } : x)))} />
                  {r.refundAmount != null &&
              <span className="text-xs text-text-gray dark:text-slate-400">Refund: {formatCurrency(r.refundAmount)} ({r.refundMethod})</span>
              }
                  {r.status === 'Pending' &&
              <Button size="sm" variant="secondary" loading={actingId === r.id} onClick={() => inspect(r)}><SearchCheckIcon className="h-3.5 w-3.5" /> Inspect</Button>
              }
                  {(r.status === 'Pending' || r.status === 'Inspected') &&
              <>
                      <Button size="sm" loading={actingId === r.id} onClick={() => approve(r)}><CheckIcon className="h-3.5 w-3.5" /> Approve</Button>
                      <Button size="sm" variant="ghost" onClick={() => { setRejectTarget(r); setRejectReason(''); }}><XIcon className="h-3.5 w-3.5" /> Reject</Button>
                    </>
              }
                  {r.refundStatus === 'Requested' &&
              <Button size="sm" variant="secondary" loading={actingId === r.id} onClick={() => approveRefund(r)}><CheckIcon className="h-3.5 w-3.5" /> Approve refund</Button>
              }
                  {r.refundStatus === 'Approved' &&
              <Button size="sm" loading={actingId === r.id} onClick={() => markRefundPaid(r)}><BanknoteIcon className="h-3.5 w-3.5" /> Mark refund paid</Button>
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
          {direction === 'customer' &&
          <div>
              <Label htmlFor="ret-source-kind">Bought via</Label>
              <Select id="ret-source-kind" value={sourceKind} onChange={(e) => changeSourceKind(e.target.value as CustomerSourceKind)}>
                <option value="sale">A counter Sale</option>
                <option value="customer-invoice">A Customer Invoice (dealer/B2B)</option>
              </Select>
            </div>
          }
          <div>
            <Label htmlFor="ret-source">{direction === 'supplier' ? 'Purchase order' : sourceKind === 'sale' ? 'Sale' : 'Invoice'}</Label>
            <Select id="ret-source" value={sourceId} onChange={(e) => selectSource(e.target.value)} disabled={noPrereqs}>
              <option value="">— select —</option>
              {sourceOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </Select>
            {noPrereqs &&
            <p className="mt-1 text-xs text-text-gray dark:text-slate-400">
                {direction === 'supplier' ? 'No Received purchase orders yet.' : sourceKind === 'sale' ? 'No sales recorded yet.' : 'No customer invoices recorded yet.'}
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

        {isInvoiceSourced && sourceId &&
        <div className="mt-4">
            <Label>Items to return</Label>
            <p className="mb-2 text-xs text-text-gray dark:text-slate-400">This invoice has no per-part catalog reference — describe what's being returned directly. It'll be credited straight to this invoice's balance.</p>
            <div className="space-y-2">
              {invoiceLines.map((l, i) =>
            <div key={i} className="grid grid-cols-12 items-center gap-2">
                  <Input
                className="col-span-6"
                placeholder="Description"
                value={l.description}
                onChange={(e) => updateInvoiceLine(i, { description: e.target.value })} />

                  <Input
                className="col-span-2"
                type="number"
                min={1}
                placeholder="Qty"
                value={l.quantity}
                onChange={(e) => updateInvoiceLine(i, { quantity: e.target.value })} />

                  <Input
                className="col-span-3"
                type="number"
                min={0}
                placeholder="Unit price"
                value={l.unitPrice}
                onChange={(e) => updateInvoiceLine(i, { unitPrice: e.target.value })} />

                  <button type="button" onClick={() => removeInvoiceLine(i)} className="col-span-1 flex items-center justify-center rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40">
                    <XIcon className="h-4 w-4" />
                  </button>
                </div>
            )}
            </div>
            <button type="button" onClick={addInvoiceLine} className="mt-2 flex items-center gap-1 text-xs font-semibold text-royal hover:underline dark:text-blue-300">
              <PlusIcon className="h-3.5 w-3.5" /> Add line
            </button>
          </div>
        }

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="ret-reason">Reason</Label>
            <Select id="ret-reason" value={reason} onChange={(e) => setReason(e.target.value as ReturnReason)}>
              {RETURN_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
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

      <Modal
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        title={rejectTarget ? `Reject ${rejectTarget.returnNumber}` : 'Reject return'}
        footer={
        <>
            <Button variant="secondary" onClick={() => setRejectTarget(null)}>Cancel</Button>
            <Button onClick={submitReject} loading={rejecting}>Reject</Button>
          </>
        }>
        <div>
          <Label htmlFor="ret-reject-reason">Reason</Label>
          <Textarea id="ret-reject-reason" required value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="e.g. Item not actually eligible for return" />
        </div>
      </Modal>
    </div>);

}

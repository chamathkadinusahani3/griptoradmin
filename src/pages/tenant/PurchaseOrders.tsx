import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ShoppingCartIcon, PlusIcon, TrashIcon, PackageCheckIcon, XIcon, PencilIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { StatusBadge } from '../../components/StatusBadge';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Textarea, Label } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { PurchaseOrder, PurchaseOrderStatus, SupplierPaymentMethod } from '../../types/purchaseOrder';
import { Supplier } from '../../types/supplier';
import { Part } from '../../types/part';
import { BankAccount } from '../../types/bankAccount';
import { formatCurrency, formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

const STATUS_FILTERS: ('All' | PurchaseOrderStatus)[] = ['All', 'Draft', 'Ordered', 'Partially Received', 'Received', 'Cancelled'];

interface DraftLine {
  partId: string;
  quantity: number;
  unitCost: number;
}

export function PurchaseOrders() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'All' | PurchaseOrderStatus>('All');
  const supplierFilter = searchParams.get('supplierId') ?? '';

  const [modalOpen, setModalOpen] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [payTarget, setPayTarget] = useState<PurchaseOrder | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<SupplierPaymentMethod>('Cash');
  const [payChequeNumber, setPayChequeNumber] = useState('');
  const [payBankAccountId, setPayBankAccountId] = useState('');
  const [paying, setPaying] = useState(false);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [receiveTarget, setReceiveTarget] = useState<PurchaseOrder | null>(null);
  const [receiveQuantities, setReceiveQuantities] = useState<Record<string, string>>({});
  const [receiving, setReceiving] = useState(false);

  const loadOrders = () => {
    api
      .get<{ purchaseOrders: PurchaseOrder[] }>('/purchase-orders')
      .then(({ purchaseOrders }) => setOrders(purchaseOrders))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load purchase orders'))
      .finally(() => setLoading(false));
  };

  useEffect(loadOrders, []);

  useEffect(() => {
    api
      .get<{ suppliers: Supplier[] }>('/suppliers')
      .then(({ suppliers }) => setSuppliers(suppliers))
      .catch((err) => {
        setSuppliers([]);
        toast.error(err instanceof ApiError ? err.message : 'Failed to load suppliers');
      });
    api
      .get<{ parts: Part[] }>('/parts')
      .then(({ parts }) => setParts(parts))
      .catch((err) => {
        setParts([]);
        toast.error(err instanceof ApiError ? err.message : 'Failed to load parts');
      });
    api.get<{ bankAccounts: BankAccount[] }>('/bank-accounts').then(({ bankAccounts }) => setBankAccounts(bankAccounts)).catch(() => setBankAccounts([]));
  }, []);

  // Arriving from Suppliers.tsx's "Reorder"/"View orders" buttons — filters
  // by supplier, and "Reorder" additionally opens the create modal preset
  // to that supplier.
  useEffect(() => {
    if (searchParams.get('create') === '1' && suppliers.length > 0) {
      openCreate(searchParams.get('supplierId') ?? '');
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('create');
        return next;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suppliers]);

  const partsBySupplier = useMemo(
    () => (supplierId ? parts.filter((p) => p.supplierId === supplierId) : parts),
    [parts, supplierId]
  );

  const openCreate = (presetSupplierId = '') => {
    setEditingOrderId(null);
    setSupplierId(presetSupplierId || suppliers[0]?.id || '');
    setExpectedDate('');
    setNotes('');
    setLines([]);
    setModalOpen(true);
  };

  const openEdit = (order: PurchaseOrder) => {
    setEditingOrderId(order.id);
    setSupplierId(order.supplierId);
    setExpectedDate(order.expectedDate ? order.expectedDate.slice(0, 10) : '');
    setNotes(order.notes ?? '');
    setLines(order.items.map((i) => ({ partId: i.partId, quantity: i.quantity, unitCost: i.unitCost })));
    setModalOpen(true);
  };

  const addLine = () => {
    const firstAvailable = partsBySupplier[0];
    if (!firstAvailable) return;
    setLines((prev) => [...prev, { partId: firstAvailable.id, quantity: 1, unitCost: firstAvailable.price }]);
  };
  const updateLine = (i: number, patch: Partial<DraftLine>) => {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  };
  const removeLine = (i: number) => setLines((prev) => prev.filter((_, idx) => idx !== i));

  const previewSubtotal = lines.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0);

  const save = async () => {
    if (!supplierId || lines.length === 0) {
      toast.error('A supplier and at least one line item are required');
      return;
    }
    setSaving(true);
    try {
      if (editingOrderId) {
        const { purchaseOrder } = await api.patch<{ purchaseOrder: PurchaseOrder }>(`/purchase-orders/${editingOrderId}`, {
          items: lines,
          expectedDate: expectedDate || undefined,
          notes: notes || undefined,
        });
        setOrders((prev) => prev.map((o) => (o.id === purchaseOrder.id ? purchaseOrder : o)));
        toast.success(`${purchaseOrder.poNumber} updated`);
      } else {
        const { purchaseOrder } = await api.post<{ purchaseOrder: PurchaseOrder }>('/purchase-orders', {
          supplierId,
          items: lines,
          expectedDate: expectedDate || undefined,
          notes: notes || undefined,
        });
        setOrders((prev) => [purchaseOrder, ...prev]);
        toast.success(`${purchaseOrder.poNumber} created`);
      }
      setModalOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : `Failed to ${editingOrderId ? 'update' : 'create'} purchase order`);
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (order: PurchaseOrder, action: 'order' | 'receive' | 'cancel', successMsg: string) => {
    setActingId(order.id);
    try {
      const { purchaseOrder } = await api.patch<{ purchaseOrder: PurchaseOrder }>(`/purchase-orders/${order.id}`, { action });
      setOrders((prev) => prev.map((o) => (o.id === order.id ? purchaseOrder : o)));
      toast.success(successMsg);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update purchase order');
    } finally {
      setActingId(null);
    }
  };

  const openReceive = (order: PurchaseOrder) => {
    setReceiveTarget(order);
    setReceiveQuantities(
      Object.fromEntries(
        order.items.filter((l) => l.receivedQuantity < l.quantity).map((l) => [l.partId, String(l.quantity - l.receivedQuantity)])
      )
    );
  };

  const submitReceive = async () => {
    if (!receiveTarget) return;
    const items = Object.entries(receiveQuantities)
      .filter(([, v]) => v.trim() !== '' && Number(v) > 0)
      .map(([partId, v]) => ({ partId, quantity: Number(v) }));
    if (items.length === 0) {
      toast.error('Enter a quantity for at least one line');
      return;
    }
    setReceiving(true);
    try {
      const { purchaseOrder } = await api.patch<{ purchaseOrder: PurchaseOrder }>(`/purchase-orders/${receiveTarget.id}`, {
        action: 'receive',
        items,
      });
      setOrders((prev) => prev.map((o) => (o.id === purchaseOrder.id ? purchaseOrder : o)));
      toast.success(`${purchaseOrder.poNumber} — stock updated (${purchaseOrder.status})`);
      setReceiveTarget(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to receive purchase order');
    } finally {
      setReceiving(false);
    }
  };

  const openPay = (order: PurchaseOrder) => {
    setPayTarget(order);
    setPayAmount(String(order.balance));
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
      const { purchaseOrder } = await api.post<{ purchaseOrder: PurchaseOrder }>(`/purchase-orders/${payTarget.id}/payment`, {
        amount,
        method: payMethod,
        chequeNumber: payMethod === 'Cheque' ? payChequeNumber.trim() : undefined,
        bankAccountId: payBankAccountId || undefined,
      });
      setOrders((prev) => prev.map((o) => (o.id === purchaseOrder.id ? purchaseOrder : o)));
      toast.success('Payment recorded');
      setPayTarget(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to record payment');
    } finally {
      setPaying(false);
    }
  };

  const filtered = orders
    .filter((o) => statusFilter === 'All' || o.status === statusFilter)
    .filter((o) => !supplierFilter || o.supplierId === supplierFilter);
  const filteredSupplierName = supplierFilter ? suppliers.find((s) => s.id === supplierFilter)?.name : undefined;
  const noPrereqs = suppliers.length === 0 || parts.length === 0;

  return (
    <div>
      <PageHeader
        title="Purchase Orders"
        description="Order parts from suppliers and receive real stock."
        action={
        <Button onClick={() => openCreate()} disabled={noPrereqs} title={noPrereqs ? 'Add a supplier and at least one part first' : undefined}>
            <PlusIcon className="h-4 w-4" /> New purchase order
          </Button>
        } />


      <div className="mb-4 flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((s) =>
        <button
          key={s}
          onClick={() => setStatusFilter(s)}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${statusFilter === s ? 'bg-griptor-gradient text-white' : 'bg-soft-gray text-text-gray hover:bg-light-blue dark:bg-slate-800 dark:text-slate-300'}`}>

            {s}
          </button>
        )}
        {filteredSupplierName &&
        <Badge tone="blue">
            Supplier: {filteredSupplierName}
            <button type="button" className="ml-1.5 align-middle" onClick={() => setSearchParams({})}>
              <XIcon className="inline h-3 w-3" />
            </button>
          </Badge>
        }
      </div>

      {loading ?
      <Card><div className="space-y-3 p-5">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div></Card> :
      filtered.length === 0 ?
      <Card><EmptyState icon={ShoppingCartIcon} title="No purchase orders" description="Create a purchase order to restock parts from a supplier." /></Card> :

      <Card>
          <ul className="divide-y divide-border-soft dark:divide-slate-800">
            {filtered.map((o) =>
          <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-navy dark:text-slate-100">{o.poNumber}</p>
                    <StatusBadge status={o.status} />
                    {(o.status === 'Ordered' || o.status === 'Partially Received' || o.status === 'Received') && <StatusBadge status={o.paymentStatus} />}
                  </div>
                  <p className="mt-1 text-xs text-text-gray dark:text-slate-400">{o.supplier} · {o.items.length} item{o.items.length === 1 ? '' : 's'}</p>
                  <p className="mt-1 text-xs text-text-gray dark:text-slate-400">
                    {formatDate(o.createdAt)}
                    {o.expectedDate && ` · Expected ${formatDate(o.expectedDate)}`}
                    {o.receivedAt && ` · Last received ${formatDate(o.receivedAt)}`}
                  </p>
                  {(o.status === 'Ordered' || o.status === 'Partially Received' || o.status === 'Received') && o.paidAmount > 0 &&
              <p className="mt-1 text-xs text-text-gray dark:text-slate-400">
                      Paid {formatCurrency(o.paidAmount)}{o.balance > 0 ? ` · Owed ${formatCurrency(o.balance)}` : ''}
                    </p>
              }
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="teal">{formatCurrency(o.total)}</Badge>
                  {(o.status === 'Ordered' || o.status === 'Partially Received' || o.status === 'Received') && o.balance > 0 &&
              <Button size="sm" variant="secondary" onClick={() => openPay(o)}>Record payment</Button>
              }
                  {o.status === 'Draft' &&
              <>
                      <button onClick={() => openEdit(o)} aria-label={`Edit ${o.poNumber}`} className="rounded-lg p-2 text-slate-400 transition hover:bg-soft-gray hover:text-navy dark:hover:bg-slate-800 dark:hover:text-slate-100">
                        <PencilIcon className="h-4 w-4" />
                      </button>
                      <Button size="sm" variant="secondary" loading={actingId === o.id} onClick={() => runAction(o, 'order', `${o.poNumber} marked as ordered`)}>Mark as ordered</Button>
                      <Button size="sm" variant="ghost" loading={actingId === o.id} onClick={() => runAction(o, 'cancel', `${o.poNumber} cancelled`)}>Cancel</Button>
                    </>
              }
                  {(o.status === 'Ordered' || o.status === 'Partially Received') &&
              <>
                      <Button size="sm" onClick={() => openReceive(o)}>
                        <PackageCheckIcon className="h-3.5 w-3.5" /> Receive
                      </Button>
                      {o.status === 'Ordered' &&
                <Button size="sm" variant="ghost" loading={actingId === o.id} onClick={() => runAction(o, 'cancel', `${o.poNumber} cancelled`)}>Cancel</Button>
                }
                    </>
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
        title={editingOrderId ? 'Edit purchase order' : 'New purchase order'}
        size="xl"
        footer={
        <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={save} loading={saving}>{editingOrderId ? 'Save changes' : 'Create purchase order'}</Button>
          </>
        }>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="po-supplier">Supplier</Label>
            <Select
              id="po-supplier"
              value={supplierId}
              disabled={!!editingOrderId}
              onChange={(e) => {
                setSupplierId(e.target.value);
                setLines([]);
              }}>

              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
            {editingOrderId && <p className="mt-1 text-xs text-text-gray dark:text-slate-400">Supplier can't be changed after creation.</p>}
          </div>
          <div>
            <Label htmlFor="po-expected">Expected date (optional)</Label>
            <Input id="po-expected" type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
          </div>
        </div>

        <div className="mt-4">
          <Label>Line items</Label>
          {partsBySupplier.length === 0 ?
          <p className="text-xs text-text-gray dark:text-slate-400">This supplier has no parts linked to it yet — add parts under Inventory first.</p> :

          <>
              <div className="space-y-2">
                {lines.map((l, i) =>
              <div key={i} className="grid grid-cols-12 gap-2">
                    <Select
                  className="col-span-6"
                  value={l.partId}
                  onChange={(e) => {
                    const part = partsBySupplier.find((p) => p.id === e.target.value);
                    updateLine(i, { partId: e.target.value, unitCost: part?.price ?? l.unitCost });
                  }}>

                      {partsBySupplier.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.stock} in stock)</option>)}
                    </Select>
                    <Input className="col-span-2" type="number" min={1} placeholder="Qty" value={l.quantity} onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })} />
                    <Input className="col-span-3" type="number" min={0} placeholder="Unit cost" value={l.unitCost} onChange={(e) => updateLine(i, { unitCost: Number(e.target.value) })} />
                    <button type="button" onClick={() => removeLine(i)} className="col-span-1 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40">
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
              )}
              </div>
              <button type="button" onClick={addLine} className="mt-2 flex items-center gap-1 text-xs font-semibold text-royal hover:underline dark:text-blue-300">
                <PlusIcon className="h-3.5 w-3.5" /> Add line
              </button>
              <p className="mt-2 text-right text-sm text-text-gray dark:text-slate-400">Total: {formatCurrency(previewSubtotal)}</p>
            </>
          }
        </div>

        <div className="mt-4">
          <Label htmlFor="po-notes">Notes</Label>
          <Textarea id="po-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </Modal>

      <Modal
        open={!!receiveTarget}
        onClose={() => setReceiveTarget(null)}
        title={receiveTarget ? `Receive — ${receiveTarget.poNumber}` : 'Receive'}
        footer={
        <>
            <Button variant="secondary" onClick={() => setReceiveTarget(null)}>Cancel</Button>
            <Button onClick={submitReceive} loading={receiving}>Confirm receipt</Button>
          </>
        }>
        {receiveTarget &&
        <div className="space-y-3">
            <p className="text-xs text-text-gray dark:text-slate-400">Enter how much of each line actually arrived — leave a line at 0 to leave it outstanding for a later delivery.</p>
            {receiveTarget.items.filter((l) => l.receivedQuantity < l.quantity).map((l) => (
              <div key={l.partId} className="grid grid-cols-12 items-center gap-2">
                <span className="col-span-7 text-sm text-navy dark:text-slate-200">
                  {l.name}
                  <span className="ml-1.5 text-xs text-text-gray dark:text-slate-400">({l.quantity - l.receivedQuantity} of {l.quantity} outstanding)</span>
                </span>
                <Input
                  type="number"
                  min={0}
                  max={l.quantity - l.receivedQuantity}
                  className="col-span-5"
                  value={receiveQuantities[l.partId] ?? ''}
                  onChange={(e) => setReceiveQuantities((prev) => ({ ...prev, [l.partId]: e.target.value }))} />

              </div>
            ))}
          </div>
        }
      </Modal>

      <Modal
        open={!!payTarget}
        onClose={() => setPayTarget(null)}
        title={payTarget ? `Record payment — ${payTarget.poNumber}` : ''}
        footer={
        <>
            <Button variant="secondary" onClick={() => setPayTarget(null)}>Cancel</Button>
            <Button onClick={recordPayment} loading={paying}>Record payment</Button>
          </>
        }>

        <div className="space-y-4">
          <div>
            <Label htmlFor="pay-amount">Amount</Label>
            <Input id="pay-amount" type="number" min={0} value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
            {payTarget && <p className="mt-1 text-xs text-text-gray dark:text-slate-400">Owed: {formatCurrency(payTarget.balance)}</p>}
          </div>
          <div>
            <Label htmlFor="pay-method">Method</Label>
            <Select id="pay-method" value={payMethod} onChange={(e) => setPayMethod(e.target.value as SupplierPaymentMethod)}>
              <option value="Cash">Cash</option>
              <option value="Card">Card</option>
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="Cheque">Cheque</option>
              <option value="Other">Other</option>
            </Select>
          </div>
          {payMethod === 'Cheque' &&
          <div>
              <Label htmlFor="pay-cheque">Cheque number</Label>
              <Input id="pay-cheque" value={payChequeNumber} onChange={(e) => setPayChequeNumber(e.target.value)} placeholder="e.g. 000123" />
            </div>
          }
          {(payMethod === 'Cheque' || payMethod === 'Bank Transfer') && bankAccounts.length > 0 &&
          <div>
              <Label htmlFor="pay-bank">Bank account (optional)</Label>
              <Select id="pay-bank" value={payBankAccountId} onChange={(e) => setPayBankAccountId(e.target.value)}>
                <option value="">— none —</option>
                {bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.bankName} · {b.accountNumber}</option>)}
              </Select>
            </div>
          }
        </div>
      </Modal>
    </div>);

}

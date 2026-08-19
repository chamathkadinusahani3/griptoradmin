import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FileTextIcon, PlusIcon, TrashIcon, PackageCheckIcon, XIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { StatusBadge } from '../../components/StatusBadge';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Label } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { SalesOrder, SalesOrderStatus } from '../../types/salesOrder';
import { Customer } from '../../types/customer';
import { Part } from '../../types/part';
import { formatCurrency, formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

const STATUS_FILTERS: ('All' | SalesOrderStatus)[] = ['All', 'Confirmed', 'Partially Fulfilled', 'Fulfilled', 'Cancelled'];

interface DraftLine {
  partId: string;
  quantity: number;
  unitPrice: number;
}

export function SalesOrders() {
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'All' | SalesOrderStatus>('All');

  const [modalOpen, setModalOpen] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  const [fulfillTarget, setFulfillTarget] = useState<SalesOrder | null>(null);
  const [fulfillQuantities, setFulfillQuantities] = useState<Record<string, string>>({});
  const [fulfilling, setFulfilling] = useState(false);

  const loadOrders = () => {
    api
      .get<{ salesOrders: SalesOrder[] }>('/sales-orders')
      .then(({ salesOrders }) => setOrders(salesOrders))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load sales orders'))
      .finally(() => setLoading(false));
  };

  useEffect(loadOrders, []);
  useEffect(() => {
    api.get<{ customers: Customer[] }>('/customers').then(({ customers }) => setCustomers(customers)).catch(() => setCustomers([]));
    api.get<{ parts: Part[] }>('/parts').then(({ parts }) => setParts(parts)).catch(() => setParts([]));
  }, []);

  const noPrereqs = customers.length === 0 || parts.length === 0;

  const openCreate = () => {
    setCustomerId(customers[0]?.id ?? '');
    setLines([]);
    setModalOpen(true);
  };

  const addLine = () => {
    const firstAvailable = parts[0];
    if (!firstAvailable) return;
    setLines((prev) => [...prev, { partId: firstAvailable.id, quantity: 1, unitPrice: firstAvailable.price }]);
  };
  const updateLine = (i: number, patch: Partial<DraftLine>) => setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const removeLine = (i: number) => setLines((prev) => prev.filter((_, idx) => idx !== i));

  const previewTotal = lines.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0);

  const save = async () => {
    if (!customerId || lines.length === 0) {
      toast.error('A customer and at least one line item are required');
      return;
    }
    setSaving(true);
    try {
      const { salesOrder } = await api.post<{ salesOrder: SalesOrder }>('/sales-orders', {
        customerId,
        items: lines.map((l) => ({ description: l.partId, quantity: l.quantity, unitPrice: l.unitPrice })),
      });
      setOrders((prev) => [salesOrder, ...prev]);
      toast.success(`${salesOrder.salesOrderNumber} created`);
      setModalOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to create sales order');
    } finally {
      setSaving(false);
    }
  };

  const cancel = async (order: SalesOrder) => {
    setActingId(order.id);
    try {
      const { salesOrder } = await api.patch<{ salesOrder: SalesOrder }>(`/sales-orders/${order.id}`, { action: 'cancel' });
      setOrders((prev) => prev.map((o) => (o.id === salesOrder.id ? salesOrder : o)));
      toast.success(`${salesOrder.salesOrderNumber} cancelled`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to cancel sales order');
    } finally {
      setActingId(null);
    }
  };

  const openFulfill = (order: SalesOrder) => {
    setFulfillTarget(order);
    setFulfillQuantities(
      Object.fromEntries(
        order.items.filter((l) => l.deliveredQuantity < l.quantity).map((l) => [l.partId, String(l.quantity - l.deliveredQuantity)])
      )
    );
  };

  const submitFulfill = async () => {
    if (!fulfillTarget) return;
    const items = Object.entries(fulfillQuantities)
      .filter(([, v]) => v.trim() !== '' && Number(v) > 0)
      .map(([partId, v]) => ({ partId, quantity: Number(v) }));
    if (items.length === 0) {
      toast.error('Enter a quantity for at least one line');
      return;
    }
    setFulfilling(true);
    try {
      const { salesOrder } = await api.post<{ salesOrder: SalesOrder }>(`/sales-orders/${fulfillTarget.id}/fulfill`, { items });
      setOrders((prev) => prev.map((o) => (o.id === salesOrder.id ? salesOrder : o)));
      toast.success(`${salesOrder.salesOrderNumber} — stock updated (${salesOrder.status})`);
      setFulfillTarget(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to fulfill sales order');
    } finally {
      setFulfilling(false);
    }
  };

  const filtered = orders.filter((o) => statusFilter === 'All' || o.status === statusFilter);

  return (
    <div>
      <PageHeader
        title="Sales Orders"
        description="Confirm a parts order now, deliver it (in full or in part) later."
        action={
        <Button onClick={openCreate} disabled={noPrereqs} title={noPrereqs ? 'Add a customer and at least one part first' : undefined}>
            <PlusIcon className="h-4 w-4" /> New sales order
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
      </div>

      {loading ?
      <Card><div className="space-y-3 p-5">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div></Card> :
      filtered.length === 0 ?
      <Card><EmptyState icon={FileTextIcon} title="No sales orders" description="Confirm a parts order for a customer to fulfill later." /></Card> :

      <Card>
          <ul className="divide-y divide-border-soft dark:divide-slate-800">
            {filtered.map((o) =>
          <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-navy dark:text-slate-100">{o.salesOrderNumber}</p>
                    <StatusBadge status={o.status} />
                  </div>
                  <p className="mt-1 text-xs text-text-gray dark:text-slate-400">{o.customerName} · {o.items.length} item{o.items.length === 1 ? '' : 's'}</p>
                  <p className="mt-1 text-xs text-text-gray dark:text-slate-400">{formatDate(o.createdAt)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="teal">{formatCurrency(o.total)}</Badge>
                  {(o.status === 'Confirmed' || o.status === 'Partially Fulfilled') &&
              <>
                      <Button size="sm" onClick={() => openFulfill(o)}>
                        <PackageCheckIcon className="h-3.5 w-3.5" /> Deliver
                      </Button>
                      {o.status === 'Confirmed' &&
                <Button size="sm" variant="ghost" loading={actingId === o.id} onClick={() => cancel(o)}><XIcon className="h-3.5 w-3.5" /> Cancel</Button>
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
        title="New sales order"
        size="xl"
        footer={
        <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={save} loading={saving}>Create sales order</Button>
          </>
        }>

        <div>
          <Label htmlFor="so-customer">Customer</Label>
          <Select id="so-customer" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>

        <div className="mt-4">
          <Label>Line items</Label>
          <div className="space-y-2">
            {lines.map((l, i) =>
            <div key={i} className="grid grid-cols-12 gap-2">
                <Select
                className="col-span-6"
                value={l.partId}
                onChange={(e) => {
                  const part = parts.find((p) => p.id === e.target.value);
                  updateLine(i, { partId: e.target.value, unitPrice: part?.price ?? l.unitPrice });
                }}>

                  {parts.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.stock} in stock)</option>)}
                </Select>
                <Input className="col-span-2" type="number" min={1} placeholder="Qty" value={l.quantity} onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })} />
                <Input className="col-span-3" type="number" min={0} placeholder="Unit price" value={l.unitPrice} onChange={(e) => updateLine(i, { unitPrice: Number(e.target.value) })} />
                <button type="button" onClick={() => removeLine(i)} className="col-span-1 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40">
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
          <button type="button" onClick={addLine} className="mt-2 flex items-center gap-1 text-xs font-semibold text-royal hover:underline dark:text-blue-300">
            <PlusIcon className="h-3.5 w-3.5" /> Add line
          </button>
          <p className="mt-2 text-right text-sm text-text-gray dark:text-slate-400">Subtotal: {formatCurrency(previewTotal)} (tax applied on save)</p>
        </div>
      </Modal>

      <Modal
        open={!!fulfillTarget}
        onClose={() => setFulfillTarget(null)}
        title={fulfillTarget ? `Deliver — ${fulfillTarget.salesOrderNumber}` : 'Deliver'}
        footer={
        <>
            <Button variant="secondary" onClick={() => setFulfillTarget(null)}>Cancel</Button>
            <Button onClick={submitFulfill} loading={fulfilling}>Confirm delivery</Button>
          </>
        }>
        {fulfillTarget &&
        <div className="space-y-3">
            <p className="text-xs text-text-gray dark:text-slate-400">Enter how much of each line is going out now — leave a line at 0 to deliver it later.</p>
            {fulfillTarget.items.filter((l) => l.deliveredQuantity < l.quantity).map((l) => (
              <div key={l.partId} className="grid grid-cols-12 items-center gap-2">
                <span className="col-span-7 text-sm text-navy dark:text-slate-200">
                  {l.name}
                  <span className="ml-1.5 text-xs text-text-gray dark:text-slate-400">({l.quantity - l.deliveredQuantity} of {l.quantity} outstanding)</span>
                </span>
                <Input
                  type="number"
                  min={0}
                  max={l.quantity - l.deliveredQuantity}
                  className="col-span-5"
                  value={fulfillQuantities[l.partId] ?? ''}
                  onChange={(e) => setFulfillQuantities((prev) => ({ ...prev, [l.partId]: e.target.value }))} />

              </div>
            ))}
          </div>
        }
      </Modal>
    </div>);

}

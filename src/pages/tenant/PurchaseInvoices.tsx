import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ReceiptIcon, PlusIcon, AlertTriangleIcon, CheckCircleIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Label, Textarea } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { PurchaseInvoice, PurchaseInvoiceLine } from '../../types/purchaseInvoice';
import { PurchaseOrder } from '../../types/purchaseOrder';
import { formatCurrency, formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function PurchaseInvoices() {
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [purchaseOrderId, setPurchaseOrderId] = useState('');
  const [supplierReference, setSupplierReference] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(todayIso());
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<PurchaseInvoiceLine[]>([]);
  const [saving, setSaving] = useState(false);

  const loadInvoices = () => {
    setLoading(true);
    api
      .get<{ invoices: PurchaseInvoice[] }>('/purchase-invoices')
      .then(({ invoices }) => setInvoices(invoices))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load purchase invoices'))
      .finally(() => setLoading(false));
  };

  useEffect(loadInvoices, []);
  useEffect(() => {
    // Only orders that have actually received something can be billed
    // against — matches the backend's Ordered/Partially Received/Received guard.
    api
      .get<{ purchaseOrders: PurchaseOrder[] }>('/purchase-orders')
      .then(({ purchaseOrders }) => setOrders(purchaseOrders.filter((o) => o.status !== 'Draft' && o.status !== 'Cancelled')))
      .catch(() => setOrders([]));
  }, []);

  const selectedOrder = orders.find((o) => o.id === purchaseOrderId);
  const noPrereqs = orders.length === 0;

  const openCreate = () => {
    setPurchaseOrderId('');
    setSupplierReference('');
    setInvoiceDate(todayIso());
    setDueDate('');
    setNotes('');
    setLines([]);
    setModalOpen(true);
  };

  const selectOrder = (id: string) => {
    setPurchaseOrderId(id);
    const order = orders.find((o) => o.id === id);
    setLines(order ? order.items.filter((l) => l.receivedQuantity > 0).map((l) => ({ partId: l.partId, name: l.name, quantity: l.receivedQuantity, unitCost: l.unitCost })) : []);
  };

  const updateLine = (i: number, patch: Partial<PurchaseInvoiceLine>) => setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const total = lines.reduce((sum, l) => sum + l.quantity * l.unitCost, 0);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!purchaseOrderId || lines.length === 0 || !invoiceDate) {
      toast.error('A purchase order, at least one item, and an invoice date are required');
      return;
    }
    setSaving(true);
    try {
      const { invoice } = await api.post<{ invoice: PurchaseInvoice }>('/purchase-invoices', {
        purchaseOrderId,
        supplierReference: supplierReference || undefined,
        items: lines,
        invoiceDate,
        dueDate: dueDate || undefined,
        notes: notes || undefined,
      });
      setInvoices((prev) => [invoice, ...prev]);
      if (invoice.matchStatus === 'Matched') {
        toast.success(`${invoice.purchaseInvoiceNumber} recorded — matches the order`);
      } else {
        toast.warning(`${invoice.purchaseInvoiceNumber} recorded — discrepancy found, see details`);
      }
      setModalOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to record purchase invoice');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Purchase Invoices"
        description="What the supplier actually billed — checked against the order and what was received."
        action={<Button onClick={openCreate} disabled={noPrereqs} title={noPrereqs ? 'No purchase orders with received stock yet' : undefined}><PlusIcon className="h-4 w-4" /> Record invoice</Button>} />


      {loading ?
      <Card><div className="p-5"><TableSkeleton rows={6} /></div></Card> :
      invoices.length === 0 ?
      <Card><EmptyState icon={ReceiptIcon} title="No purchase invoices yet" description="Record a supplier's bill against a purchase order to check it matches what was ordered and received." /></Card> :

      <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead>
                <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                  <th className="px-5 py-3 font-bold">Invoice</th>
                  <th className="px-5 py-3 font-bold">Purchase order</th>
                  <th className="px-5 py-3 font-bold">Supplier ref.</th>
                  <th className="px-5 py-3 font-bold">Date</th>
                  <th className="px-5 py-3 text-right font-bold">Total</th>
                  <th className="px-5 py-3 font-bold">Match</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) =>
              <tr key={inv.id} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                    <td className="px-5 py-3 font-bold text-navy dark:text-slate-100">{inv.purchaseInvoiceNumber}</td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-300">{inv.poNumber ?? '—'}</td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">{inv.supplierReference ?? '—'}</td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">{formatDate(inv.invoiceDate)}</td>
                    <td className="px-5 py-3 text-right font-bold text-navy dark:text-slate-100">{formatCurrency(inv.total)}</td>
                    <td className="px-5 py-3">
                      {inv.matchStatus === 'Matched' ?
                  <Badge tone="green"><CheckCircleIcon className="mr-1 inline h-3 w-3" /> Matched</Badge> :

                  <div>
                          <Badge tone="red"><AlertTriangleIcon className="mr-1 inline h-3 w-3" /> Discrepancy</Badge>
                          <ul className="mt-1 space-y-0.5 text-xs text-red-600 dark:text-red-400">
                            {inv.discrepancyNotes.map((n, i) => <li key={i}>{n}</li>)}
                          </ul>
                        </div>
                  }
                    </td>
                  </tr>
              )}
              </tbody>
            </table>
          </div>
        </Card>
      }

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Record a purchase invoice"
        size="lg"
        footer={
        <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button form="purchase-invoice-form" type="submit" loading={saving}>Record invoice</Button>
          </>
        }>
        <form id="purchase-invoice-form" onSubmit={save} className="space-y-4">
          <div>
            <Label htmlFor="pi-po">Purchase order</Label>
            <Select id="pi-po" value={purchaseOrderId} onChange={(e) => selectOrder(e.target.value)}>
              <option value="">— select a purchase order —</option>
              {orders.map((o) => <option key={o.id} value={o.id}>{o.poNumber} · {o.supplier}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="pi-ref">Supplier's invoice number (optional)</Label>
              <Input id="pi-ref" value={supplierReference} onChange={(e) => setSupplierReference(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="pi-date">Invoice date</Label>
              <Input id="pi-date" type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="pi-due">Due date (optional)</Label>
            <Input id="pi-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>

          {selectedOrder &&
          <div>
              <Label>Items billed</Label>
              {lines.length === 0 ?
            <p className="text-xs text-text-gray dark:text-slate-400">Nothing has been received against this order yet.</p> :

            <div className="space-y-2">
                  {lines.map((line, i) =>
              <div key={line.partId} className="grid grid-cols-12 items-center gap-2">
                      <span className="col-span-5 text-sm text-navy dark:text-slate-200">{line.name}</span>
                      <Input type="number" min={0} value={line.quantity} onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })} className="col-span-3" />
                      <Input type="number" min={0} value={line.unitCost} onChange={(e) => updateLine(i, { unitCost: Number(e.target.value) })} className="col-span-4" />
                    </div>
              )}
                </div>
            }
              <p className="mt-2 text-right text-sm text-text-gray dark:text-slate-400">Total: {formatCurrency(total)}</p>
              <p className="mt-1 text-xs text-text-gray dark:text-slate-400">Pre-filled from what was received at the order's own prices — edit to match what the supplier actually billed.</p>
            </div>
          }

          <div>
            <Label htmlFor="pi-notes">Notes (optional)</Label>
            <Textarea id="pi-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </form>
      </Modal>
    </div>);

}

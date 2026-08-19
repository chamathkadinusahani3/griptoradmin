import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ArrowLeftRightIcon, PlusIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Label, Textarea } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { StockTransfer } from '../../types/stockTransfer';
import { Part } from '../../types/part';
import { Warehouse } from '../../types/warehouse';
import { formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

const emptyForm = { fromPartId: '', toWarehouseId: '', quantity: '', notes: '' };

export function StockTransfers() {
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const loadTransfers = () => {
    setLoading(true);
    api
      .get<{ transfers: StockTransfer[] }>('/stock-transfers')
      .then(({ transfers }) => setTransfers(transfers))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load stock transfers'))
      .finally(() => setLoading(false));
  };

  useEffect(loadTransfers, []);
  useEffect(() => {
    api.get<{ parts: Part[] }>('/parts').then(({ parts }) => setParts(parts)).catch(() => setParts([]));
    api.get<{ warehouses: Warehouse[] }>('/warehouses').then(({ warehouses }) => setWarehouses(warehouses)).catch(() => setWarehouses([]));
  }, []);

  const selectedPart = parts.find((p) => p.id === form.fromPartId);
  const noPrereqs = parts.length === 0 || warehouses.length < 2;

  const openCreate = () => {
    setForm(emptyForm);
    setModalOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fromPartId || !form.toWarehouseId || !form.quantity || Number(form.quantity) <= 0) {
      toast.error('A source part, destination warehouse, and positive quantity are required');
      return;
    }
    setSaving(true);
    try {
      const { transfer } = await api.post<{ transfer: StockTransfer }>('/stock-transfers', {
        fromPartId: form.fromPartId,
        toWarehouseId: form.toWarehouseId,
        quantity: Number(form.quantity),
        notes: form.notes || undefined,
      });
      setTransfers((prev) => [transfer, ...prev]);
      toast.success('Stock transferred');
      setModalOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to transfer stock');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Stock Transfers"
        description="Move stock between warehouses."
        action={<Button onClick={openCreate} disabled={noPrereqs} title={noPrereqs ? 'Add parts and at least two warehouses first' : undefined}><PlusIcon className="h-4 w-4" /> New transfer</Button>} />


      {noPrereqs &&
      <p className="mb-4 text-sm text-text-gray dark:text-slate-400">
          You need at least one part and two warehouses before you can transfer stock.
        </p>
      }

      {loading ?
      <Card><div className="p-5"><TableSkeleton rows={6} /></div></Card> :
      transfers.length === 0 ?
      <Card><EmptyState icon={ArrowLeftRightIcon} title="No transfers yet" description="Stock moved between warehouses will show up here." /></Card> :

      <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead>
                <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                  <th className="px-5 py-3 font-bold">Date</th>
                  <th className="px-5 py-3 font-bold">Part</th>
                  <th className="px-5 py-3 font-bold">To warehouse</th>
                  <th className="px-5 py-3 text-right font-bold">Quantity</th>
                  <th className="px-5 py-3 font-bold">Notes</th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((t) =>
              <tr key={t.id} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">{formatDate(t.createdAt)}</td>
                    <td className="px-5 py-3 font-semibold text-navy dark:text-slate-100">{t.fromPartName ?? t.toPartName ?? '—'}</td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">{t.toWarehouseName ?? '—'}</td>
                    <td className="px-5 py-3 text-right font-bold text-navy dark:text-slate-100">{t.quantity}</td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">{t.notes ?? '—'}</td>
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
        title="New stock transfer"
        footer={
        <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button form="stock-transfer-form" type="submit" loading={saving}>Transfer</Button>
          </>
        }>
        <form id="stock-transfer-form" onSubmit={save} className="space-y-4">
          <div>
            <Label htmlFor="st-from">Part</Label>
            <Select id="st-from" value={form.fromPartId} onChange={(e) => setForm((f) => ({ ...f, fromPartId: e.target.value }))}>
              <option value="">— select a part —</option>
              {parts.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.stock} in stock)</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="st-to">To warehouse</Label>
            <Select id="st-to" value={form.toWarehouseId} onChange={(e) => setForm((f) => ({ ...f, toWarehouseId: e.target.value }))}>
              <option value="">— select a warehouse —</option>
              {warehouses.filter((w) => w.id !== selectedPart?.warehouseId).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="st-qty">Quantity</Label>
            <Input id="st-qty" type="number" min={1} max={selectedPart?.stock} value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} />
            {selectedPart && <p className="mt-1 text-xs text-text-gray dark:text-slate-400">{selectedPart.stock} available</p>}
          </div>
          <div>
            <Label htmlFor="st-notes">Notes (optional)</Label>
            <Textarea id="st-notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
        </form>
      </Modal>
    </div>);

}

import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ClipboardListIcon, PlusIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Label } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { StockCount } from '../../types/stockCount';
import { Branch } from '../../types/branch';
import { Warehouse } from '../../types/warehouse';
import { formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

export function StockCounts() {
  const [counts, setCounts] = useState<StockCount[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [scopeBranchId, setScopeBranchId] = useState('');
  const [scopeWarehouseId, setScopeWarehouseId] = useState('');
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<StockCount | null>(null);
  const [draftCounts, setDraftCounts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  const loadCounts = () => {
    setLoading(true);
    api
      .get<{ stockCounts: StockCount[] }>('/stock-counts')
      .then(({ stockCounts }) => setCounts(stockCounts))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load stock counts'))
      .finally(() => setLoading(false));
  };

  useEffect(loadCounts, []);
  useEffect(() => {
    api.get<{ branches: Branch[] }>('/branches').then(({ branches }) => setBranches(branches)).catch(() => setBranches([]));
    api.get<{ warehouses: Warehouse[] }>('/warehouses').then(({ warehouses }) => setWarehouses(warehouses)).catch(() => setWarehouses([]));
  }, []);

  const openCreate = () => {
    setScopeBranchId('');
    setScopeWarehouseId('');
    setCreateOpen(true);
  };

  const create = async () => {
    setCreating(true);
    try {
      const { stockCount } = await api.post<{ stockCount: StockCount }>('/stock-counts', {
        branchId: scopeBranchId || undefined,
        warehouseId: scopeWarehouseId || undefined,
      });
      setCounts((prev) => [stockCount, ...prev]);
      toast.success('Stock count started');
      setCreateOpen(false);
      openDetail(stockCount);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to start stock count');
    } finally {
      setCreating(false);
    }
  };

  const openDetail = (count: StockCount) => {
    setSelected(count);
    setDraftCounts(Object.fromEntries(count.lines.map((l) => [l.partId, l.countedQty !== null ? String(l.countedQty) : ''])));
  };

  const saveProgress = async () => {
    if (!selected) return;
    const lines = Object.entries(draftCounts)
      .filter(([, v]) => v.trim() !== '')
      .map(([partId, v]) => ({ partId, countedQty: Number(v) }));
    if (lines.length === 0) {
      toast.error('Enter at least one counted quantity');
      return;
    }
    setSaving(true);
    try {
      const { stockCount } = await api.patch<{ stockCount: StockCount }>(`/stock-counts/${selected.id}`, { action: 'count', lines });
      setCounts((prev) => prev.map((c) => (c.id === stockCount.id ? stockCount : c)));
      setSelected(stockCount);
      toast.success('Progress saved');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to save progress');
    } finally {
      setSaving(false);
    }
  };

  const finalize = async () => {
    if (!selected) return;
    setFinalizing(true);
    try {
      const { stockCount } = await api.patch<{ stockCount: StockCount }>(`/stock-counts/${selected.id}`, { action: 'finalize' });
      setCounts((prev) => prev.map((c) => (c.id === stockCount.id ? stockCount : c)));
      setSelected(stockCount);
      toast.success('Stock count finalized — stock levels updated');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to finalize stock count');
    } finally {
      setFinalizing(false);
    }
  };

  const scopeLabel = (count: StockCount) => {
    if (count.warehouseId) return warehouses.find((w) => w.id === count.warehouseId)?.name ?? 'Unknown warehouse';
    if (count.branchId) return branches.find((b) => b.id === count.branchId)?.name ?? 'Unknown branch';
    return 'Entire inventory';
  };

  return (
    <div>
      <PageHeader
        title="Stock Counts"
        description="Cycle-count sessions — snapshot expected quantities, walk the shelves, then finalize to reconcile."
        action={<Button onClick={openCreate}><PlusIcon className="h-4 w-4" /> New count</Button>} />


      {loading ?
      <Card><div className="p-5"><TableSkeleton rows={6} /></div></Card> :
      counts.length === 0 ?
      <Card><EmptyState icon={ClipboardListIcon} title="No stock counts yet" description="Start a count to reconcile system quantities against what's actually on the shelf." /></Card> :

      <Card>
          <ul className="divide-y divide-border-soft dark:divide-slate-800">
            {counts.map((c) =>
          <li key={c.id} className="flex cursor-pointer items-center justify-between gap-4 p-4 hover:bg-soft-gray dark:hover:bg-slate-800/60" onClick={() => openDetail(c)}>
                <div>
                  <p className="flex items-center gap-1.5 font-bold text-navy dark:text-slate-100">
                    {scopeLabel(c)}
                    <Badge tone={c.status === 'Finalized' ? 'green' : 'amber'}>{c.status}</Badge>
                  </p>
                  <p className="text-xs text-text-gray dark:text-slate-400">
                    {c.lines.length} parts · started {formatDate(c.createdAt)}
                    {c.finalizedAt ? ` · finalized ${formatDate(c.finalizedAt)}` : ''}
                  </p>
                </div>
              </li>
          )}
          </ul>
        </Card>
      }

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Start a stock count"
        footer={
        <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={create} loading={creating}>Start count</Button>
          </>
        }>
        <div className="space-y-4">
          {branches.length > 0 &&
          <div>
              <Label htmlFor="sc-branch">Branch (optional)</Label>
              <Select id="sc-branch" value={scopeBranchId} onChange={(e) => { setScopeBranchId(e.target.value); setScopeWarehouseId(''); }}>
                <option value="">— entire inventory —</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </div>
          }
          {warehouses.length > 0 &&
          <div>
              <Label htmlFor="sc-warehouse">Or just one warehouse (optional)</Label>
              <Select id="sc-warehouse" value={scopeWarehouseId} onChange={(e) => setScopeWarehouseId(e.target.value)}>
                <option value="">— entire inventory —</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </Select>
            </div>
          }
          <p className="text-xs text-text-gray dark:text-slate-400">Every part's current stock in this scope will be snapshotted as the expected quantity.</p>
        </div>
      </Modal>

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? scopeLabel(selected) : 'Stock count'}
        size="lg"
        footer={
        selected && selected.status === 'Open' ?
        <>
            <Button variant="secondary" onClick={saveProgress} loading={saving}>Save progress</Button>
            <Button onClick={finalize} loading={finalizing}>Finalize</Button>
          </> :

        <Button variant="secondary" onClick={() => setSelected(null)}>Close</Button>

        }>
        {selected &&
        <div className="overflow-x-auto">
            <table className="w-full min-w-[500px] text-left text-sm">
              <thead>
                <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                  <th className="px-3 py-2 font-bold">Part</th>
                  <th className="px-3 py-2 text-right font-bold">System qty</th>
                  <th className="px-3 py-2 text-right font-bold">Counted qty</th>
                </tr>
              </thead>
              <tbody>
                {selected.lines.map((l) =>
              <tr key={l.partId} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                    <td className="px-3 py-2 font-semibold text-navy dark:text-slate-100">{l.name}</td>
                    <td className="px-3 py-2 text-right text-text-gray dark:text-slate-400">{l.systemQty}</td>
                    <td className="px-3 py-2 text-right">
                      {selected.status === 'Open' ?
                  <Input
                    type="number"
                    min={0}
                    className="w-24 text-right"
                    value={draftCounts[l.partId] ?? ''}
                    onChange={(e) => setDraftCounts((prev) => ({ ...prev, [l.partId]: e.target.value }))} /> :


                  <span className={l.countedQty !== null && l.countedQty !== l.systemQty ? 'font-bold text-amber-600 dark:text-amber-400' : 'text-text-gray dark:text-slate-400'}>
                          {l.countedQty ?? '—'}
                        </span>
                  }
                    </td>
                  </tr>
              )}
              </tbody>
            </table>
          </div>
        }
      </Modal>
    </div>);

}

import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { TargetIcon, PlusIcon, PencilIcon, TrashIcon, WalletIcon, TrendingUpIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { StatCard } from '../../components/ui/StatCard';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Label } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { SalesTarget, TARGET_PERIOD_TYPES, TargetPeriodType } from '../../types/salesTarget';
import { Salesperson } from '../../types/salesperson';
import { formatCurrency, formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

function achievementTone(pct: number): 'green' | 'amber' | 'red' {
  if (pct >= 100) return 'green';
  if (pct >= 60) return 'amber';
  return 'red';
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function monthEndIso() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
}

const emptyForm = { salespersonId: '', periodType: 'Monthly' as TargetPeriodType, periodStart: todayIso(), periodEnd: monthEndIso(), targetAmount: '' };

export function SalesTargets() {
  const [targets, setTargets] = useState<SalesTarget[]>([]);
  const [salespersons, setSalespersons] = useState<Salesperson[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadTargets = () => {
    setLoading(true);
    api
      .get<{ targets: SalesTarget[] }>('/sales-targets')
      .then(({ targets }) => setTargets(targets))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load sales targets'))
      .finally(() => setLoading(false));
  };

  useEffect(loadTargets, []);
  useEffect(() => {
    api.get<{ salespersons: Salesperson[] }>('/salespersons').then(({ salespersons }) => setSalespersons(salespersons)).catch(() => setSalespersons([]));
  }, []);

  const summary = useMemo(() => {
    const totalTarget = targets.reduce((sum, t) => sum + t.targetAmount, 0);
    const totalActual = targets.reduce((sum, t) => sum + t.actualSales, 0);
    const achievementPct = totalTarget > 0 ? Math.round((totalActual / totalTarget) * 1000) / 10 : 0;
    return { totalTarget, totalActual, achievementPct };
  }, [targets]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (t: SalesTarget) => {
    setEditingId(t.id);
    setForm({
      salespersonId: t.salespersonId,
      periodType: t.periodType,
      periodStart: t.periodStart.slice(0, 10),
      periodEnd: t.periodEnd.slice(0, 10),
      targetAmount: String(t.targetAmount),
    });
    setModalOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.salespersonId || !form.periodStart || !form.periodEnd || !form.targetAmount) {
      toast.error('A salesperson, period range, and target amount are required');
      return;
    }
    if (form.periodEnd < form.periodStart) {
      toast.error('Period end must be on or after period start');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        const { target } = await api.patch<{ target: SalesTarget }>(`/sales-targets/${editingId}`, {
          periodType: form.periodType,
          periodStart: form.periodStart,
          periodEnd: form.periodEnd,
          targetAmount: Number(form.targetAmount),
        });
        setTargets((prev) => prev.map((t) => (t.id === target.id ? target : t)));
        toast.success('Target updated');
      } else {
        const { target } = await api.post<{ target: SalesTarget }>('/sales-targets', {
          salespersonId: form.salespersonId,
          periodType: form.periodType,
          periodStart: form.periodStart,
          periodEnd: form.periodEnd,
          targetAmount: Number(form.targetAmount),
        });
        setTargets((prev) => [target, ...prev]);
        toast.success('Target added');
      }
      setModalOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : `Failed to ${editingId ? 'update' : 'add'} target`);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (t: SalesTarget) => {
    setDeletingId(t.id);
    try {
      await api.delete(`/sales-targets/${t.id}`);
      setTargets((prev) => prev.filter((x) => x.id !== t.id));
      toast.success('Target removed');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to remove target');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Sales Targets"
        description="Target vs. actual sales, attributed to each salesperson's confirmed Sales Orders and Invoices."
        action={<Button onClick={openCreate} disabled={salespersons.length === 0}><PlusIcon className="h-4 w-4" /> Add target</Button>} />


      {!loading && targets.length > 0 &&
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="Total target" value={formatCurrency(summary.totalTarget)} icon={TargetIcon} />
          <StatCard label="Actual sales" value={formatCurrency(summary.totalActual)} icon={WalletIcon} />
          <StatCard label="Achievement" value={`${summary.achievementPct}%`} icon={TrendingUpIcon} />
        </div>
      }

      {loading ?
      <Card><div className="p-5"><TableSkeleton rows={6} /></div></Card> :
      targets.length === 0 ?
      <Card><EmptyState icon={TargetIcon} title="No sales targets yet" description="Add a target to start tracking a salesperson's performance against it." /></Card> :

      <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                  <th className="px-5 py-3 font-bold">Salesperson</th>
                  <th className="px-5 py-3 font-bold">Period</th>
                  <th className="px-5 py-3 text-right font-bold">Target</th>
                  <th className="px-5 py-3 text-right font-bold">Actual</th>
                  <th className="px-5 py-3 font-bold">Achievement</th>
                  <th className="px-5 py-3 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {targets.map((t) =>
              <tr key={t.id} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                    <td className="px-5 py-3 font-semibold text-navy dark:text-slate-100">{t.salespersonName ?? t.salespersonId}</td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">
                      {t.periodType}
                      <span className="block text-xs">{formatDate(t.periodStart)} – {formatDate(t.periodEnd)}</span>
                    </td>
                    <td className="px-5 py-3 text-right text-navy dark:text-slate-100">{formatCurrency(t.targetAmount)}</td>
                    <td className="px-5 py-3 text-right text-navy dark:text-slate-100">{formatCurrency(t.actualSales)}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-soft-gray dark:bg-slate-800">
                          <div className="h-full rounded-full bg-griptor-gradient" style={{ width: `${Math.min(100, t.achievementPct)}%` }} />
                        </div>
                        <Badge tone={achievementTone(t.achievementPct)}>{t.achievementPct}%</Badge>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1.5">
                        <button onClick={() => openEdit(t)} aria-label={`Edit target for ${t.salespersonName ?? 'salesperson'}`} className="rounded-lg p-2 text-slate-400 transition hover:bg-soft-gray hover:text-navy dark:hover:bg-slate-800 dark:hover:text-slate-100">
                          <PencilIcon className="h-4 w-4" />
                        </button>
                        <button onClick={() => remove(t)} disabled={deletingId === t.id} aria-label={`Remove target for ${t.salespersonName ?? 'salesperson'}`} className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-500/10 dark:hover:text-red-400">
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
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
        title={editingId ? 'Edit target' : 'Add target'}
        size="lg"
        footer={
        <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button form="target-form" type="submit" loading={saving}>{editingId ? 'Save changes' : 'Add target'}</Button>
          </>
        }>
        <form id="target-form" onSubmit={save} className="space-y-4">
          <div>
            <Label htmlFor="st-salesperson">Salesperson</Label>
            <Select id="st-salesperson" disabled={!!editingId} value={form.salespersonId} onChange={(e) => setForm((f) => ({ ...f, salespersonId: e.target.value }))}>
              <option value="">— select —</option>
              {salespersons.map((sp) => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="st-period-type">Period type</Label>
            <Select id="st-period-type" value={form.periodType} onChange={(e) => setForm((f) => ({ ...f, periodType: e.target.value as typeof form.periodType }))}>
              {TARGET_PERIOD_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="st-start">Period start</Label>
              <Input id="st-start" type="date" value={form.periodStart} onChange={(e) => setForm((f) => ({ ...f, periodStart: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="st-end">Period end</Label>
              <Input id="st-end" type="date" value={form.periodEnd} onChange={(e) => setForm((f) => ({ ...f, periodEnd: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label htmlFor="st-amount">Target amount</Label>
            <Input id="st-amount" type="number" min={0} value={form.targetAmount} onChange={(e) => setForm((f) => ({ ...f, targetAmount: e.target.value }))} />
          </div>
        </form>
      </Modal>
    </div>);

}

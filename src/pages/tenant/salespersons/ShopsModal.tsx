import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PlusIcon, TrashIcon, StoreIcon } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Select, Label } from '../../../components/ui/Input';
import { EmptyState } from '../../../components/ui/EmptyState';
import { TableSkeleton } from '../../../components/ui/Skeleton';
import { Salesperson } from '../../../types/salesperson';
import { Customer } from '../../../types/customer';
import { DeliveryRoute } from '../../../types/route';
import { SalespersonAssignment, VISIT_FREQUENCIES, ASSIGNMENT_PRIORITIES, VISIT_DAYS } from '../../../types/salespersonAssignment';
import { api, ApiError } from '../../../lib/api';

const PRIORITY_TONE: Record<string, 'red' | 'amber' | 'gray'> = { High: 'red', Medium: 'amber', Low: 'gray' };

const emptyForm = { customerId: '', territory: '', routeId: '', visitFrequency: 'Weekly' as const, preferredVisitDay: '', priority: 'Medium' as const };

export function ShopsModal({ salesperson, onClose }: { salesperson: Salesperson; onClose: () => void }) {
  const [assignments, setAssignments] = useState<SalespersonAssignment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [routes, setRoutes] = useState<DeliveryRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ ...emptyForm, routeId: salesperson.routeId ?? '' });
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api
      .get<{ assignments: SalespersonAssignment[] }>(`/salesperson-assignments?salespersonId=${salesperson.id}`)
      .then(({ assignments }) => setAssignments(assignments))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load assigned shops'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [salesperson.id]);
  useEffect(() => {
    api.get<{ customers: Customer[] }>('/customers').then(({ customers }) => setCustomers(customers)).catch(() => setCustomers([]));
    api.get<{ routes: DeliveryRoute[] }>('/sf-routes').then(({ routes }) => setRoutes(routes)).catch(() => setRoutes([]));
  }, []);

  const assignedCustomerIds = new Set(assignments.map((a) => a.customerId));
  const availableCustomers = customers.filter((c) => !assignedCustomerIds.has(c.id));

  const assign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customerId) {
      toast.error('Select a shop to assign');
      return;
    }
    setSaving(true);
    try {
      const { assignment } = await api.post<{ assignment: SalespersonAssignment }>('/salesperson-assignments', {
        salespersonId: salesperson.id,
        customerId: form.customerId,
        territory: form.territory || undefined,
        routeId: form.routeId || undefined,
        visitFrequency: form.visitFrequency,
        preferredVisitDay: form.preferredVisitDay || undefined,
        priority: form.priority,
      });
      setAssignments((prev) => [assignment, ...prev]);
      setForm({ ...emptyForm, routeId: salesperson.routeId ?? '' });
      toast.success('Shop assigned');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to assign shop');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (a: SalespersonAssignment) => {
    setRemovingId(a.id);
    try {
      await api.delete(`/salesperson-assignments/${a.id}`);
      setAssignments((prev) => prev.filter((x) => x.id !== a.id));
      toast.success('Assignment removed');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to remove assignment');
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Assigned shops — ${salesperson.name}`} size="lg">
      <div className="mb-5 rounded-xl border border-border-soft p-4 dark:border-slate-700">
        <p className="mb-3 text-sm font-semibold text-navy dark:text-slate-100">Assign a shop</p>
        {availableCustomers.length === 0 && customers.length > 0 ?
        <p className="text-sm text-text-gray dark:text-slate-400">Every customer is already assigned to this salesperson.</p> :
        customers.length === 0 ?
        <p className="text-sm text-text-gray dark:text-slate-400">No customers exist yet.</p> :

        <form onSubmit={assign} className="space-y-3">
            <div>
              <Label htmlFor="am-customer">Shop / customer</Label>
              <Select id="am-customer" value={form.customerId} onChange={(e) => setForm((f) => ({ ...f, customerId: e.target.value }))}>
                <option value="">— select —</option>
                {availableCustomers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="am-route">Route</Label>
                <Select id="am-route" value={form.routeId} onChange={(e) => setForm((f) => ({ ...f, routeId: e.target.value }))}>
                  <option value="">— none —</option>
                  {routes.map((r) => <option key={r.id} value={r.id}>{r.code} — {r.name}</option>)}
                </Select>
              </div>
              <div>
                <Label htmlFor="am-frequency">Visit frequency</Label>
                <Select id="am-frequency" value={form.visitFrequency} onChange={(e) => setForm((f) => ({ ...f, visitFrequency: e.target.value as typeof form.visitFrequency }))}>
                  {VISIT_FREQUENCIES.map((v) => <option key={v} value={v}>{v}</option>)}
                </Select>
              </div>
              <div>
                <Label htmlFor="am-day">Preferred day</Label>
                <Select id="am-day" value={form.preferredVisitDay} onChange={(e) => setForm((f) => ({ ...f, preferredVisitDay: e.target.value }))}>
                  <option value="">— any —</option>
                  {VISIT_DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
                </Select>
              </div>
              <div>
                <Label htmlFor="am-priority">Priority</Label>
                <Select id="am-priority" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as typeof form.priority }))}>
                  {ASSIGNMENT_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                </Select>
              </div>
            </div>
            <Button type="submit" size="sm" loading={saving}><PlusIcon className="h-4 w-4" /> Assign shop</Button>
          </form>
        }
      </div>

      {loading ?
      <TableSkeleton rows={4} /> :
      assignments.length === 0 ?
      <EmptyState icon={StoreIcon} title="No shops assigned" description="Assign a shop above to start scheduling this salesperson's visits." /> :

      <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead>
              <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                <th className="px-3 py-2 font-bold">Shop</th>
                <th className="px-3 py-2 font-bold">Route</th>
                <th className="px-3 py-2 font-bold">Frequency</th>
                <th className="px-3 py-2 font-bold">Preferred day</th>
                <th className="px-3 py-2 font-bold">Priority</th>
                <th className="px-3 py-2 text-right font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) =>
            <tr key={a.id} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                  <td className="px-3 py-2 font-semibold text-navy dark:text-slate-100">{a.customerName ?? a.customerId}</td>
                  <td className="px-3 py-2 text-text-gray dark:text-slate-400">{a.routeName ?? '—'}</td>
                  <td className="px-3 py-2 text-text-gray dark:text-slate-400">{a.visitFrequency}</td>
                  <td className="px-3 py-2 text-text-gray dark:text-slate-400">{a.preferredVisitDay ?? '—'}</td>
                  <td className="px-3 py-2"><Badge tone={PRIORITY_TONE[a.priority]}>{a.priority}</Badge></td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => remove(a)} disabled={removingId === a.id} aria-label={`Remove ${a.customerName ?? 'shop'} assignment`} className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-500/10 dark:hover:text-red-400">
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
            )}
            </tbody>
          </table>
        </div>
      }
    </Modal>);

}

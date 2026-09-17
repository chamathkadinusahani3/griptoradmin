import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PackageMinusIcon, PlusIcon, TrashIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Textarea, Label } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { StockIssue, StockIssueLine } from '../../types/stockIssue';
import { Part } from '../../types/part';
import { Department } from '../../types/department';
import { formatCurrency, formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

interface DraftLine {
  partId: string;
  quantity: string;
}

const emptyLine: DraftLine = { partId: '', quantity: '1' };
const emptyForm = { issuedTo: '', departmentId: '', notes: '' };

export function StockIssues() {
  const [issues, setIssues] = useState<StockIssue[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [lines, setLines] = useState<DraftLine[]>([{ ...emptyLine }]);
  const [saving, setSaving] = useState(false);

  const loadIssues = () => {
    setLoading(true);
    api
      .get<{ stockIssues: StockIssue[] }>('/stock-issues')
      .then(({ stockIssues }) => setIssues(stockIssues))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load stock issues'))
      .finally(() => setLoading(false));
  };

  useEffect(loadIssues, []);
  useEffect(() => {
    api.get<{ parts: Part[] }>('/parts').then(({ parts }) => setParts(parts)).catch(() => setParts([]));
    api.get<{ departments: Department[] }>('/departments').then(({ departments }) => setDepartments(departments)).catch(() => setDepartments([]));
  }, []);

  const openCreate = () => {
    setForm(emptyForm);
    setLines([{ ...emptyLine }]);
    setModalOpen(true);
  };

  const updateLine = (i: number, patch: Partial<DraftLine>) => {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  };
  const addLine = () => setLines((prev) => [...prev, { ...emptyLine }]);
  const removeLine = (i: number) => setLines((prev) => prev.filter((_, idx) => idx !== i));

  const previewTotal = lines.reduce((sum, l) => {
    const part = parts.find((p) => p.id === l.partId);
    return sum + (part ? part.price * (Number(l.quantity) || 0) : 0);
  }, 0);

  const save = async () => {
    const validLines = lines.filter((l) => l.partId && Number(l.quantity) > 0);
    if (!form.issuedTo.trim() || validLines.length === 0) {
      toast.error('Who the stock was issued to, and at least one item, are required');
      return;
    }
    setSaving(true);
    try {
      const { stockIssue } = await api.post<{ stockIssue: StockIssue }>('/stock-issues', {
        items: validLines.map((l) => ({ partId: l.partId, quantity: Number(l.quantity) })),
        issuedTo: form.issuedTo.trim(),
        departmentId: form.departmentId || undefined,
        notes: form.notes || undefined,
      });
      setIssues((prev) => [stockIssue, ...prev]);
      toast.success(`${stockIssue.stockIssueNumber} recorded`);
      setModalOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to record stock issue');
    } finally {
      setSaving(false);
    }
  };

  const lineLabel = (l: StockIssueLine) => `${l.name} × ${l.quantity}`;
  const noPrereqs = parts.length === 0;

  return (
    <div>
      <PageHeader
        title="Stock Issues"
        description="Parts leaving stock for internal use — not a sale."
        action={<Button onClick={openCreate} disabled={noPrereqs} title={noPrereqs ? 'Add a part first' : undefined}><PlusIcon className="h-4 w-4" /> New stock issue</Button>} />


      {loading ?
      <Card><div className="space-y-3 p-5">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div></Card> :
      issues.length === 0 ?
      <Card><EmptyState icon={PackageMinusIcon} title="No stock issues" description="Record parts issued for internal use, a department, or non-job consumption." /></Card> :

      <Card>
          <ul className="divide-y divide-border-soft dark:divide-slate-800">
            {issues.map((s) =>
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-navy dark:text-slate-100">{s.stockIssueNumber}</p>
                    <Badge tone="amber">{s.issuedTo}</Badge>
                    {s.departmentName && <Badge tone="gray">{s.departmentName}</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-text-gray dark:text-slate-400">{s.items.map(lineLabel).join(', ')}</p>
                  <p className="mt-1 text-xs text-text-gray dark:text-slate-400">{formatDate(s.createdAt)}</p>
                </div>
                <Badge tone="teal">{formatCurrency(s.totalValue)}</Badge>
              </li>
          )}
          </ul>
        </Card>
      }

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="New stock issue"
        size="xl"
        footer={
        <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={save} loading={saving}>Record issue</Button>
          </>
        }>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="si-issued-to">Issued to</Label>
            <Input id="si-issued-to" value={form.issuedTo} onChange={(e) => setForm({ ...form, issuedTo: e.target.value })} placeholder="e.g. Service bay, John (workshop)" />
          </div>
          <div>
            <Label htmlFor="si-department">Department (optional)</Label>
            <Select id="si-department" value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}>
              <option value="">— none —</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </div>
        </div>

        <div className="mt-4">
          <Label>Items</Label>
          <div className="space-y-2">
            {lines.map((l, i) =>
            <div key={i} className="grid grid-cols-12 gap-2">
                <Select className="col-span-7" value={l.partId} onChange={(e) => updateLine(i, { partId: e.target.value })}>
                  <option value="">— select a part —</option>
                  {parts.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.stock} in stock)</option>)}
                </Select>
                <Input className="col-span-4" type="number" min={1} placeholder="Qty" value={l.quantity} onChange={(e) => updateLine(i, { quantity: e.target.value })} />
                <button type="button" onClick={() => removeLine(i)} className="col-span-1 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40">
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
          <button type="button" onClick={addLine} className="mt-2 flex items-center gap-1 text-xs font-semibold text-royal hover:underline dark:text-blue-300">
            <PlusIcon className="h-3.5 w-3.5" /> Add line
          </button>
          <p className="mt-2 text-right text-sm text-text-gray dark:text-slate-400">Total value: {formatCurrency(previewTotal)}</p>
        </div>

        <div className="mt-4">
          <Label htmlFor="si-notes">Notes (optional)</Label>
          <Textarea id="si-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
      </Modal>
    </div>);

}

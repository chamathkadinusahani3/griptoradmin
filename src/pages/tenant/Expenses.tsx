import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { WalletIcon, PlusIcon, TrashIcon, PencilIcon, TagIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { StatCard } from '../../components/ui/StatCard';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Textarea, Label } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { Expense, EXPENSE_CATEGORIES, ExpenseCategory } from '../../types/expense';
import { formatCurrency, formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

const CATEGORY_FILTERS: ('All' | ExpenseCategory)[] = ['All', ...EXPENSE_CATEGORIES];
const emptyForm = { category: EXPENSE_CATEGORIES[0] as ExpenseCategory, description: '', amount: '', date: '', vendorName: '', notes: '' };

export function Expenses() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<'All' | ExpenseCategory>('All');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadExpenses = () => {
    api
      .get<{ expenses: Expense[] }>('/expenses')
      .then(({ expenses }) => setExpenses(expenses))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load expenses'))
      .finally(() => setLoading(false));
  };

  useEffect(loadExpenses, []);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm, date: new Date().toISOString().slice(0, 10) });
    setModalOpen(true);
  };

  const openEdit = (e: Expense) => {
    setEditingId(e.id);
    setForm({
      category: e.category,
      description: e.description,
      amount: String(e.amount),
      date: e.date.slice(0, 10),
      vendorName: e.vendorName ?? '',
      notes: e.notes ?? '',
    });
    setModalOpen(true);
  };

  const save = async () => {
    const amount = Number(form.amount);
    if (!form.description.trim() || !amount || amount <= 0 || !form.date) {
      toast.error('Description, a positive amount, and date are required');
      return;
    }
    setSaving(true);
    try {
      const body = {
        category: form.category,
        description: form.description,
        amount,
        date: form.date,
        vendorName: form.vendorName || undefined,
        notes: form.notes || undefined,
      };
      if (editingId) {
        const { expense } = await api.patch<{ expense: Expense }>(`/expenses/${editingId}`, body);
        setExpenses((prev) => prev.map((x) => (x.id === editingId ? expense : x)));
        toast.success('Expense updated');
      } else {
        const { expense } = await api.post<{ expense: Expense }>('/expenses', body);
        setExpenses((prev) => [expense, ...prev]);
        toast.success(`${expense.expenseNumber} logged`);
      }
      setModalOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to save expense');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (e: Expense) => {
    setDeletingId(e.id);
    try {
      await api.delete(`/expenses/${e.id}`);
      setExpenses((prev) => prev.filter((x) => x.id !== e.id));
      toast.success('Expense deleted');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to delete expense');
    } finally {
      setDeletingId(null);
    }
  };

  const filtered = categoryFilter === 'All' ? expenses : expenses.filter((e) => e.category === categoryFilter);

  const { totalThisMonth, topCategory } = useMemo(() => {
    const now = new Date();
    const thisMonth = expenses.filter((e) => {
      const d = new Date(e.date);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });
    const total = thisMonth.reduce((sum, e) => sum + e.amount, 0);
    const byCategory = new Map<string, number>();
    for (const e of thisMonth) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount);
    let top: string | undefined;
    let topAmount = 0;
    for (const [cat, amt] of byCategory) {
      if (amt > topAmount) {
        top = cat;
        topAmount = amt;
      }
    }
    return { totalThisMonth: total, topCategory: top };
  }, [expenses]);

  return (
    <div>
      <PageHeader
        title="Expenses"
        description="Track money going out — rent, utilities, and off-POS purchases."
        action={<Button onClick={openCreate}><PlusIcon className="h-4 w-4" /> Log expense</Button>} />


      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="This month" value={formatCurrency(totalThisMonth)} icon={WalletIcon} />
        <StatCard label="Top category this month" value={topCategory ?? '—'} icon={TagIcon} />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {CATEGORY_FILTERS.map((c) =>
        <button
          key={c}
          onClick={() => setCategoryFilter(c)}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${categoryFilter === c ? 'bg-griptor-gradient text-white' : 'bg-soft-gray text-text-gray hover:bg-light-blue dark:bg-slate-800 dark:text-slate-300'}`}>

            {c}
          </button>
        )}
      </div>

      {loading ?
      <Card><div className="space-y-3 p-5">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div></Card> :
      filtered.length === 0 ?
      <Card><EmptyState icon={WalletIcon} title="No expenses" description="Log an expense to start tracking money going out." /></Card> :

      <Card>
          <ul className="divide-y divide-border-soft dark:divide-slate-800">
            {filtered.map((e) =>
          <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-navy dark:text-slate-100">{e.description}</p>
                    <Badge tone="gray">{e.category}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-text-gray dark:text-slate-400">
                    {e.expenseNumber} · {formatDate(e.date)}{e.vendorName ? ` · ${e.vendorName}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="red">{formatCurrency(e.amount)}</Badge>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(e)}><PencilIcon className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" loading={deletingId === e.id} onClick={() => remove(e)}><TrashIcon className="h-3.5 w-3.5" /></Button>
                </div>
              </li>
          )}
          </ul>
        </Card>
      }

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Edit expense' : 'Log expense'}
        footer={
        <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={save} loading={saving}>{editingId ? 'Save changes' : 'Log expense'}</Button>
          </>
        }>

        <div className="space-y-4">
          <div>
            <Label htmlFor="exp-category">Category</Label>
            <Select id="exp-category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as ExpenseCategory })}>
              {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="exp-description">Description</Label>
            <Input id="exp-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. July rent" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="exp-amount">Amount</Label>
              <Input id="exp-amount" type="number" min={0} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="exp-date">Date</Label>
              <Input id="exp-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
          </div>
          <div>
            <Label htmlFor="exp-vendor">Vendor (optional)</Label>
            <Input id="exp-vendor" value={form.vendorName} onChange={(e) => setForm({ ...form, vendorName: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="exp-notes">Notes</Label>
            <Textarea id="exp-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
      </Modal>
    </div>);

}

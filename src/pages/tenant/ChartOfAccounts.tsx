import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { LibraryIcon, PlusIcon, TrashIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Toggle } from '../../components/ui/Toggle';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Label, Textarea } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { ChartOfAccount, AccountType } from '../../types/chartOfAccounts';
import { api, ApiError } from '../../lib/api';

const ACCOUNT_TYPES: AccountType[] = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];
const TYPE_TONE: Record<AccountType, 'blue' | 'red' | 'purple' | 'green' | 'amber'> = {
  Asset: 'blue',
  Liability: 'red',
  Equity: 'purple',
  Revenue: 'green',
  Expense: 'amber',
};
const emptyForm = { code: '', name: '', type: 'Expense' as AccountType, description: '' };

export function ChartOfAccounts() {
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<'All' | AccountType>('All');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api
      .get<{ accounts: ChartOfAccount[] }>('/chart-of-accounts')
      .then(({ accounts }) => setAccounts(accounts))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load chart of accounts'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openCreate = () => {
    setForm(emptyForm);
    setModalOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code.trim() || !form.name.trim()) {
      toast.error('Code and name are required');
      return;
    }
    setSaving(true);
    try {
      const { account } = await api.post<{ account: ChartOfAccount }>('/chart-of-accounts', form);
      setAccounts((prev) => [...prev, account].sort((a, b) => a.code.localeCompare(b.code)));
      toast.success(`${account.code} · ${account.name} added`);
      setModalOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to add account');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (account: ChartOfAccount) => {
    const previous = accounts;
    setAccounts((prev) => prev.map((a) => (a.id === account.id ? { ...a, active: !a.active } : a)));
    try {
      await api.patch(`/chart-of-accounts/${account.id}`, { active: !account.active });
    } catch (err) {
      setAccounts(previous);
      toast.error(err instanceof ApiError ? err.message : 'Failed to update account');
    }
  };

  const remove = async (account: ChartOfAccount) => {
    setDeletingId(account.id);
    try {
      await api.delete(`/chart-of-accounts/${account.id}`);
      setAccounts((prev) => prev.filter((a) => a.id !== account.id));
      toast.success('Account removed');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to remove account');
    } finally {
      setDeletingId(null);
    }
  };

  const filtered = accounts.filter((a) => typeFilter === 'All' || a.type === typeFilter);

  return (
    <div>
      <PageHeader
        title="Chart of Accounts"
        description="A default set of accounts was created for you — add your own or deactivate ones you don't use."
        action={<Button onClick={openCreate}><PlusIcon className="h-4 w-4" /> Add account</Button>} />


      <div className="mb-4 flex flex-wrap gap-2">
        {(['All', ...ACCOUNT_TYPES] as const).map((t) =>
        <button
          key={t}
          onClick={() => setTypeFilter(t)}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${typeFilter === t ? 'bg-griptor-gradient text-white' : 'bg-soft-gray text-text-gray hover:bg-light-blue dark:bg-slate-800 dark:text-slate-300'}`}>

            {t}
          </button>
        )}
      </div>

      {loading ?
      <Card><div className="p-5"><TableSkeleton rows={8} /></div></Card> :
      filtered.length === 0 ?
      <Card><EmptyState icon={LibraryIcon} title="No accounts" description="Add an account to start tagging transactions against your chart of accounts." /></Card> :

      <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead>
                <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                  <th className="px-5 py-3 font-bold">Code</th>
                  <th className="px-5 py-3 font-bold">Name</th>
                  <th className="px-5 py-3 font-bold">Type</th>
                  <th className="px-5 py-3 text-center font-bold">Active</th>
                  <th className="px-5 py-3 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) =>
              <tr key={a.id} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                    <td className="px-5 py-3 font-mono text-xs text-text-gray dark:text-slate-400">{a.code}</td>
                    <td className="px-5 py-3">
                      <p className="font-semibold text-navy dark:text-slate-100">{a.name}</p>
                      {a.description && <p className="text-xs text-text-gray dark:text-slate-400">{a.description}</p>}
                    </td>
                    <td className="px-5 py-3"><Badge tone={TYPE_TONE[a.type]}>{a.type}</Badge></td>
                    <td className="px-5 py-3 text-center"><Toggle checked={a.active} onChange={() => toggleActive(a)} /></td>
                    <td className="px-5 py-3 text-right">
                      {!a.isSystem &&
                  <button onClick={() => remove(a)} disabled={deletingId === a.id} aria-label={`Remove ${a.name}`} className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-500/10 dark:hover:text-red-400">
                          <TrashIcon className="h-4 w-4" />
                        </button>
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
        title="Add account"
        footer={
        <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button form="account-form" type="submit" loading={saving}>Add account</Button>
          </>
        }>
        <form id="account-form" onSubmit={save} className="space-y-4">
          <div>
            <Label htmlFor="acc-code">Code</Label>
            <Input id="acc-code" required placeholder="e.g. 5700" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="acc-name">Name</Label>
            <Input id="acc-name" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="acc-type">Type</Label>
            <Select id="acc-type" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as AccountType }))}>
              {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="acc-desc">Description (optional)</Label>
            <Textarea id="acc-desc" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </div>
        </form>
      </Modal>
    </div>);

}

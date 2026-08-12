import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { LandmarkIcon, PlusIcon, PencilIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input, Label, Textarea } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { CardSkeleton } from '../../components/ui/Skeleton';
import { BankAccount } from '../../types/bankAccount';
import { api, ApiError } from '../../lib/api';

const emptyForm = { bankName: '', accountNumber: '', accountHolderName: '', branch: '', notes: '' };

export function BankAccounts() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const loadAccounts = () => {
    setLoading(true);
    api
      .get<{ bankAccounts: BankAccount[] }>('/bank-accounts')
      .then(({ bankAccounts }) => setAccounts(bankAccounts))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load bank accounts'))
      .finally(() => setLoading(false));
  };

  useEffect(loadAccounts, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (account: BankAccount) => {
    setEditingId(account.id);
    setForm({
      bankName: account.bankName,
      accountNumber: account.accountNumber,
      accountHolderName: account.accountHolderName ?? '',
      branch: account.branch ?? '',
      notes: account.notes ?? '',
    });
    setModalOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        const { bankAccount } = await api.patch<{ bankAccount: BankAccount }>(`/bank-accounts/${editingId}`, form);
        setAccounts((prev) => prev.map((a) => (a.id === bankAccount.id ? bankAccount : a)));
        toast.success('Bank account updated');
      } else {
        const { bankAccount } = await api.post<{ bankAccount: BankAccount }>('/bank-accounts', form);
        setAccounts((prev) => [...prev, bankAccount]);
        toast.success('Bank account added');
      }
      setModalOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : `Failed to ${editingId ? 'update' : 'add'} bank account`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Bank Accounts"
        description="The accounts your cheques and bank transfers move through."
        action={<Button onClick={openCreate}><PlusIcon className="h-4 w-4" /> Add bank account</Button>} />


      {loading ?
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <CardSkeleton /><CardSkeleton />
        </div> :
      accounts.length === 0 ?
      <Card><EmptyState icon={LandmarkIcon} title="No bank accounts yet" description="Add an account to start recording cheques and bank transfers against it." /></Card> :

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {accounts.map((a) =>
        <Card key={a.id} className="p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-light-blue text-teal dark:bg-teal/15">
                <LandmarkIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-navy dark:text-slate-100">{a.bankName}</p>
                <p className="truncate text-sm text-text-gray dark:text-slate-400">{a.accountNumber}</p>
              </div>
              <button onClick={() => openEdit(a)} aria-label={`Edit ${a.bankName}`} className="rounded-lg p-2 text-slate-400 transition hover:bg-soft-gray hover:text-navy dark:hover:bg-slate-800 dark:hover:text-slate-100">
                <PencilIcon className="h-4 w-4" />
              </button>
            </div>
            {(a.accountHolderName || a.branch) &&
          <p className="mt-3 text-xs text-text-gray dark:text-slate-400">
                {[a.accountHolderName, a.branch].filter(Boolean).join(' · ')}
              </p>
          }
            {a.notes && <p className="mt-1 text-xs text-text-gray dark:text-slate-500">{a.notes}</p>}
          </Card>
        )}
      </div>
      }

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Edit bank account' : 'Add bank account'}
        footer={
        <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button form="bank-account-form" type="submit" loading={saving}>{editingId ? 'Save changes' : 'Add bank account'}</Button>
          </>
        }>
        <form id="bank-account-form" onSubmit={save} className="space-y-4">
          <div>
            <Label htmlFor="ba-bank">Bank name</Label>
            <Input id="ba-bank" required value={form.bankName} onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="ba-account">Account number</Label>
            <Input id="ba-account" required value={form.accountNumber} onChange={(e) => setForm((f) => ({ ...f, accountNumber: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="ba-holder">Account holder name (optional)</Label>
            <Input id="ba-holder" value={form.accountHolderName} onChange={(e) => setForm((f) => ({ ...f, accountHolderName: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="ba-branch">Branch (optional)</Label>
            <Input id="ba-branch" value={form.branch} onChange={(e) => setForm((f) => ({ ...f, branch: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="ba-notes">Notes (optional)</Label>
            <Textarea id="ba-notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
        </form>
      </Modal>
    </div>);

}

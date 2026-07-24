import React, { useEffect, useState, useRef } from 'react';
import { toast } from 'sonner';
import { MapPinIcon, PlusIcon, LockIcon, StarIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input, Label } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { Branch } from '../../types/branch';
import { Client } from '../../types/client';
import { api, ApiError } from '../../lib/api';

const emptyForm = { name: '', address: '', phone: '' };

export function Branches() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [garage, setGarage] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const autoCreated = useRef(false);

  const multiEnabled = garage?.addOns.includes('gms-multi') ?? false;

  const loadBranches = () => {
    setLoading(true);
    api
      .get<{ branches: Branch[] }>('/branches')
      .then(({ branches }) => setBranches(branches))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load branches'))
      .finally(() => setLoading(false));
  };

  useEffect(loadBranches, []);
  useEffect(() => {
    api.get<{ client: Client }>('/tenant/me').then(({ client }) => setGarage(client)).catch(() => setGarage(null));
  }, []);

  // First visit with gms-multi active and no branches yet: auto-create a
  // default one named after the garage, so multi-location isn't a blank
  // page the tenant has to figure out how to bootstrap.
  useEffect(() => {
    if (!multiEnabled || loading || branches.length > 0 || autoCreated.current || !garage) return;
    autoCreated.current = true;
    api
      .post<{ branch: Branch }>('/branches', { name: garage.name })
      .then(({ branch }) => setBranches([branch]))
      .catch(() => {});
  }, [multiEnabled, loading, branches.length, garage]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/branches', form);
      toast.success(`${form.name} added`);
      setAddOpen(false);
      setForm(emptyForm);
      loadBranches();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to add branch');
    } finally {
      setSaving(false);
    }
  };

  const makeDefault = async (branch: Branch) => {
    const previous = branches;
    setBranches((prev) => prev.map((b) => ({ ...b, isDefault: b.id === branch.id })));
    try {
      await api.patch(`/branches/${branch.id}`, { isDefault: true });
    } catch (err) {
      setBranches(previous);
      toast.error(err instanceof ApiError ? err.message : 'Failed to update branch');
    }
  };

  return (
    <div>
      <PageHeader
        title="Branches"
        description="Manage your garage's locations."
        action={<Button onClick={() => setAddOpen(true)} disabled={!multiEnabled}><PlusIcon className="h-4 w-4" /> Add branch</Button>} />


      {!multiEnabled &&
      <Card className="mb-6">
          <div className="flex items-center gap-3 p-5">
            <LockIcon className="h-5 w-5 text-text-gray dark:text-slate-400" />
            <div>
              <p className="font-bold text-navy dark:text-slate-100">Multi-location Support isn't enabled</p>
              <p className="text-sm text-text-gray dark:text-slate-400">Ask GRIPTOR to enable the Multi-location Support add-on to manage more than one branch.</p>
            </div>
          </div>
        </Card>
      }

      {loading ?
      <Card><div className="space-y-3 p-5">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div></Card> :
      branches.length === 0 ?
      <Card><EmptyState icon={MapPinIcon} title="No branches yet" description="Add your garage's locations here." /></Card> :

      <Card>
          <ul className="divide-y divide-border-soft dark:divide-slate-800">
            {branches.map((b) =>
          <li key={b.id} className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 font-bold text-navy dark:text-slate-100">
                    {b.name}
                    {b.isDefault && <Badge tone="blue">Default</Badge>}
                  </p>
                  {(b.address || b.phone) &&
              <p className="text-xs text-text-gray dark:text-slate-400">{[b.address, b.phone].filter(Boolean).join(' · ')}</p>
              }
                </div>
                {!b.isDefault &&
            <Button size="sm" variant="secondary" onClick={() => makeDefault(b)}><StarIcon className="h-3.5 w-3.5" /> Make default</Button>
            }
              </li>
          )}
          </ul>
        </Card>
      }

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add branch"
        footer={
        <>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button form="add-branch-form" type="submit" loading={saving}>Add branch</Button>
          </>
        }>
        <form id="add-branch-form" onSubmit={handleAdd} className="space-y-4">
          <div>
            <Label htmlFor="br-name">Branch name</Label>
            <Input id="br-name" required placeholder="e.g. Downtown" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="br-address">Address (optional)</Label>
            <Input id="br-address" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="br-phone">Phone (optional)</Label>
            <Input id="br-phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </div>
        </form>
      </Modal>
    </div>);

}

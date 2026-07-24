import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { GiftIcon, PlusIcon, LockIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input, Label } from '../../components/ui/Input';
import { Toggle } from '../../components/ui/Toggle';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { LoyaltyReward } from '../../types/loyaltyReward';
import { Client } from '../../types/client';
import { api, ApiError } from '../../lib/api';

const emptyForm = { name: '', pointsCost: '100' };

export function Rewards() {
  const [rewards, setRewards] = useState<LoyaltyReward[]>([]);
  const [garage, setGarage] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const loyaltyEnabled = garage?.addOns.includes('crm-loyalty') ?? false;

  const loadRewards = () => {
    setLoading(true);
    api
      .get<{ rewards: LoyaltyReward[] }>('/loyalty-rewards')
      .then(({ rewards }) => setRewards(rewards))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load rewards'))
      .finally(() => setLoading(false));
  };

  useEffect(loadRewards, []);
  useEffect(() => {
    api.get<{ client: Client }>('/tenant/me').then(({ client }) => setGarage(client)).catch(() => setGarage(null));
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/loyalty-rewards', { name: form.name, pointsCost: Number(form.pointsCost) || 0 });
      toast.success(`${form.name} added`);
      setAddOpen(false);
      setForm(emptyForm);
      loadRewards();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to add reward');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (reward: LoyaltyReward) => {
    const previous = rewards;
    setRewards((prev) => prev.map((r) => (r.id === reward.id ? { ...r, active: !r.active } : r)));
    try {
      await api.patch(`/loyalty-rewards/${reward.id}`, { active: !reward.active });
    } catch (err) {
      setRewards(previous);
      toast.error(err instanceof ApiError ? err.message : 'Failed to update reward');
    }
  };

  return (
    <div>
      <PageHeader
        title="Rewards"
        description="What customers can redeem their loyalty points for."
        action={<Button onClick={() => setAddOpen(true)} disabled={!loyaltyEnabled}><PlusIcon className="h-4 w-4" /> Add reward</Button>} />


      {!loyaltyEnabled &&
      <Card className="mb-6">
          <div className="flex items-center gap-3 p-5">
            <LockIcon className="h-5 w-5 text-text-gray dark:text-slate-400" />
            <div>
              <p className="font-bold text-navy dark:text-slate-100">Loyalty & Rewards isn't enabled</p>
              <p className="text-sm text-text-gray dark:text-slate-400">Ask GRIPTOR to enable the Loyalty & Rewards add-on to start earning and redeeming points.</p>
            </div>
          </div>
        </Card>
      }

      {loading ?
      <Card><div className="space-y-3 p-5">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div></Card> :
      rewards.length === 0 ?
      <Card><EmptyState icon={GiftIcon} title="No rewards yet" description="Add rewards customers can redeem their points for." /></Card> :

      <Card>
          <ul className="divide-y divide-border-soft dark:divide-slate-800">
            {rewards.map((r) =>
          <li key={r.id} className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <p className="font-bold text-navy dark:text-slate-100">{r.name}</p>
                  <p className="text-xs text-text-gray dark:text-slate-400">{r.pointsCost} points</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-gray dark:text-slate-400">{r.active ? 'Available' : 'Hidden'}</span>
                  <Toggle checked={r.active} onChange={() => toggleActive(r)} />
                </div>
              </li>
          )}
          </ul>
        </Card>
      }

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add reward"
        footer={
        <>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button form="add-reward-form" type="submit" loading={saving}>Add reward</Button>
          </>
        }>
        <form id="add-reward-form" onSubmit={handleAdd} className="space-y-4">
          <div>
            <Label htmlFor="rw-name">Reward name</Label>
            <Input id="rw-name" required placeholder="e.g. Free Oil Change" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="rw-cost">Points cost</Label>
            <Input id="rw-cost" type="number" min={1} required value={form.pointsCost} onChange={(e) => setForm((f) => ({ ...f, pointsCost: e.target.value }))} />
          </div>
        </form>
      </Modal>
    </div>);

}

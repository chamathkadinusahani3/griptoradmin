import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CheckIcon, PlusIcon, XIcon, PencilIcon, StarIcon, UsersIcon, SparklesIcon, TrashIcon, EyeOffIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Label, Textarea } from '../../components/ui/Input';
import { Toggle } from '../../components/ui/Toggle';
import { CardSkeleton } from '../../components/ui/Skeleton';
import { formatCurrency, cn } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';
import { PricingTier } from '../../types/pricingTier';
import { Client } from '../../types/client';

export function Subscriptions() {
  const [tiers, setTiers] = useState<PricingTier[]>([]);
  const [loadingTiers, setLoadingTiers] = useState(true);
  const [editing, setEditing] = useState<PricingTier | null>(null);
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editFeatures, setEditFeatures] = useState<string[]>([]);
  const [newFeature, setNewFeature] = useState('');
  const [editHidden, setEditHidden] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingTierId, setDeletingTierId] = useState<string | null>(null);

  const [clients, setClients] = useState<Client[]>([]);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignClient, setAssignClient] = useState('');
  const [assignPlan, setAssignPlan] = useState('Professional');
  const [assigning, setAssigning] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createPrice, setCreatePrice] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createFeatures, setCreateFeatures] = useState<string[]>([]);
  const [newCreateFeature, setNewCreateFeature] = useState('');
  const [creatingTier, setCreatingTier] = useState(false);

  const loadTiers = () => {
    setLoadingTiers(true);
    api
      .get<{ tiers: PricingTier[] }>('/pricing-tiers')
      .then(({ tiers }) => setTiers(tiers))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load pricing tiers'))
      .finally(() => setLoadingTiers(false));
  };

  useEffect(loadTiers, []);

  useEffect(() => {
    api
      .get<{ clients: Client[] }>('/clients')
      .then(({ clients }) => {
        setClients(clients);
        if (clients.length > 0) setAssignClient(clients[0].id);
      })
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load clients'));
  }, []);

  const openEdit = (tier: PricingTier) => {
    setEditing(tier);
    setEditName(tier.name);
    setEditPrice(tier.price != null ? String(tier.price) : '');
    setEditDescription(tier.description);
    setEditFeatures([...tier.features]);
    setNewFeature('');
    setEditHidden(!!tier.hidden);
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (!editName.trim()) {
      toast.error('A plan name is required');
      return;
    }
    setSavingEdit(true);
    try {
      const { tier } = await api.patch<{ tier: PricingTier }>(`/pricing-tiers/${editing.id}`, {
        name: editName.trim(),
        price: editPrice.trim() ? Number(editPrice) : null,
        description: editDescription,
        features: editFeatures,
        hidden: editHidden,
      });
      setTiers((prev) => prev.map((t) => (t.id === editing.id ? tier : t)));
      toast.success(`${tier.name} plan updated`);
      setEditing(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to save plan');
    } finally {
      setSavingEdit(false);
    }
  };

  const deleteTier = async (tier: PricingTier) => {
    setDeletingTierId(tier.id);
    try {
      await api.delete(`/pricing-tiers/${tier.id}`);
      setTiers((prev) => prev.filter((t) => t.id !== tier.id));
      toast.success(`${tier.name} plan deleted`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to delete plan');
    } finally {
      setDeletingTierId(null);
    }
  };

  const openCreate = () => {
    setCreateName('');
    setCreatePrice('');
    setCreateDescription('');
    setCreateFeatures([]);
    setNewCreateFeature('');
    setCreateOpen(true);
  };

  const createTier = async () => {
    if (!createName.trim()) {
      toast.error('A plan name is required');
      return;
    }
    setCreatingTier(true);
    try {
      const { tier } = await api.post<{ tier: PricingTier }>('/pricing-tiers', {
        name: createName.trim(),
        price: createPrice.trim() ? Number(createPrice) : null,
        description: createDescription,
        features: createFeatures,
      });
      setTiers((prev) => [...prev, tier]);
      toast.success(`${tier.name} plan created`);
      setCreateOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to create plan');
    } finally {
      setCreatingTier(false);
    }
  };

  const assignPlanToClient = async () => {
    const client = clients.find((c) => c.id === assignClient);
    if (!client) return;
    setAssigning(true);
    try {
      await api.patch(`/clients/${client.id}`, { plan: assignPlan });
      toast.success(`${client.name} assigned to the ${assignPlan} plan`);
      setAssignOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to assign plan');
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Subscriptions"
        description="Manage GRIPTOR's pricing tiers and assign plans to clients."
        action={
        <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={openCreate}>
              <SparklesIcon className="h-4 w-4" /> Create plan
            </Button>
            <Button onClick={() => setAssignOpen(true)} disabled={clients.length === 0}>
              <UsersIcon className="h-4 w-4" /> Assign plan
            </Button>
          </div>
        } />


      {loadingTiers ?
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <CardSkeleton /><CardSkeleton /><CardSkeleton />
        </div> :

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {tiers.map((tier) =>
        <Card
          key={tier.id}
          className={cn(
            'relative flex flex-col overflow-hidden',
            tier.popular && 'ring-2 ring-bright-blue'
          )}>

            {(tier.popular || tier.hidden) &&
          <div className="absolute right-4 top-4 flex flex-col items-end gap-1.5">
                {tier.popular &&
            <Badge tone="teal">
                    <StarIcon className="h-3 w-3" /> Most Popular
                  </Badge>
            }
                {tier.hidden &&
            <Badge tone="gray">
                    <EyeOffIcon className="h-3 w-3" /> Hidden from website
                  </Badge>
            }
              </div>
          }
            <div className="p-6">
              <h3 className="text-lg font-extrabold text-navy dark:text-slate-100">{tier.name}</h3>
              <p className="mt-1 text-sm text-text-gray dark:text-slate-400">{tier.description}</p>
              <div className="mt-4 flex items-end gap-1">
                {tier.price ?
              <>
                    <span className="text-4xl font-extrabold text-navy dark:text-white">{formatCurrency(tier.price)}</span>
                    <span className="mb-1 text-sm text-text-gray dark:text-slate-400">{tier.cadence}</span>
                  </> :

              <span className="text-4xl font-extrabold text-navy dark:text-white">Custom</span>
              }
              </div>
            </div>
            <div className="flex-1 border-t border-border-soft px-6 py-5 dark:border-slate-800">
              <ul className="space-y-3">
                {tier.features.map((f) =>
              <li key={f} className="flex items-start gap-2.5 text-sm text-navy dark:text-slate-200">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-light-blue text-teal dark:bg-teal/20">
                      <CheckIcon className="h-3 w-3" strokeWidth={3} />
                    </span>
                    {f}
                  </li>
              )}
              </ul>
            </div>
            <div className="flex gap-2 p-6 pt-0">
              <Button variant="secondary" className="flex-1" onClick={() => openEdit(tier)}>
                <PencilIcon className="h-4 w-4" /> Edit plan
              </Button>
              <Button
              variant="ghost"
              loading={deletingTierId === tier.id}
              onClick={() => deleteTier(tier)}
              aria-label={`Delete ${tier.name}`}>

                <TrashIcon className="h-4 w-4 text-red-500" />
              </Button>
            </div>
          </Card>
        )}
      </div>
      }

      {/* Edit plan modal */}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? `Edit ${editing.name}` : ''}
        size="xl"
        footer={
        <>
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button loading={savingEdit} onClick={saveEdit}>Save changes</Button>
          </>
        }>

        <div className="space-y-4">
          <div>
            <Label htmlFor="edit-plan-name">Plan name</Label>
            <Input id="edit-plan-name" value={editName} onChange={(e) => setEditName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="edit-plan-price">Monthly price (leave blank for Custom pricing)</Label>
            <Input
              id="edit-plan-price"
              type="number"
              min={0}
              placeholder="e.g. 349"
              value={editPrice}
              onChange={(e) => setEditPrice(e.target.value)} />

          </div>
          <div>
            <Label htmlFor="edit-plan-description">Description</Label>
            <Textarea id="edit-plan-description" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border-soft p-3 dark:border-slate-800">
            <div>
              <p className="text-sm font-semibold text-navy dark:text-slate-100">Hidden from website</p>
              <p className="text-xs text-text-gray dark:text-slate-400">
                Marks this plan as hidden — doesn't yet affect griptorweb's public Pricing page, which has its own separate plan list.
              </p>
            </div>
            <Toggle checked={editHidden} onChange={setEditHidden} />
          </div>
          <div>
            <Label>Features</Label>
            <div className="space-y-2">
              {editFeatures.map((f, i) =>
              <div key={i} className="flex items-center gap-2 rounded-xl border border-border-soft px-3 py-2 dark:border-slate-800">
                  <CheckIcon className="h-4 w-4 shrink-0 text-teal" />
                  <span className="flex-1 text-sm text-navy dark:text-slate-200">{f}</span>
                  <button
                  onClick={() => setEditFeatures((prev) => prev.filter((_, idx) => idx !== i))}
                  aria-label={`Remove ${f}`}
                  className="rounded-lg p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10">

                    <XIcon className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
            <div className="mt-2 flex gap-2">
              <Input
                placeholder="Add a feature…"
                value={newFeature}
                onChange={(e) => setNewFeature(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newFeature.trim()) {
                    setEditFeatures((prev) => [...prev, newFeature.trim()]);
                    setNewFeature('');
                  }
                }} />

              <Button
                variant="secondary"
                onClick={() => {
                  if (newFeature.trim()) {
                    setEditFeatures((prev) => [...prev, newFeature.trim()]);
                    setNewFeature('');
                  }
                }}>

                <PlusIcon className="h-4 w-4" /> Add
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Create plan modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create a new plan"
        footer={
        <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button loading={creatingTier} onClick={createTier}>Create plan</Button>
          </>
        }>

        <div className="space-y-4">
          <div>
            <Label htmlFor="new-plan-name">Plan name</Label>
            <Input id="new-plan-name" placeholder="e.g. Ultra" value={createName} onChange={(e) => setCreateName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="new-plan-price">Monthly price (leave blank for Custom pricing)</Label>
            <Input
              id="new-plan-price"
              type="number"
              min={0}
              placeholder="e.g. 349"
              value={createPrice}
              onChange={(e) => setCreatePrice(e.target.value)} />

          </div>
          <div>
            <Label htmlFor="new-plan-description">Description</Label>
            <Textarea id="new-plan-description" value={createDescription} onChange={(e) => setCreateDescription(e.target.value)} />
          </div>
          <div>
            <Label>Features</Label>
            <div className="space-y-2">
              {createFeatures.map((f, i) =>
              <div key={i} className="flex items-center gap-2 rounded-xl border border-border-soft px-3 py-2 dark:border-slate-800">
                  <CheckIcon className="h-4 w-4 shrink-0 text-teal" />
                  <span className="flex-1 text-sm text-navy dark:text-slate-200">{f}</span>
                  <button
                  onClick={() => setCreateFeatures((prev) => prev.filter((_, idx) => idx !== i))}
                  aria-label={`Remove ${f}`}
                  className="rounded-lg p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10">

                    <XIcon className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
            <div className="mt-2 flex gap-2">
              <Input
                placeholder="Add a feature…"
                value={newCreateFeature}
                onChange={(e) => setNewCreateFeature(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newCreateFeature.trim()) {
                    setCreateFeatures((prev) => [...prev, newCreateFeature.trim()]);
                    setNewCreateFeature('');
                  }
                }} />

              <Button
                variant="secondary"
                onClick={() => {
                  if (newCreateFeature.trim()) {
                    setCreateFeatures((prev) => [...prev, newCreateFeature.trim()]);
                    setNewCreateFeature('');
                  }
                }}>

                <PlusIcon className="h-4 w-4" /> Add
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Assign plan modal */}
      <Modal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title="Assign or change a client's plan"
        footer={
        <>
            <Button variant="secondary" onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button loading={assigning} onClick={assignPlanToClient}>
              Assign plan
            </Button>
          </>
        }>

        <div className="space-y-4">
          <div>
            <Label htmlFor="assign-client">Client</Label>
            <Select id="assign-client" value={assignClient} onChange={(e) => setAssignClient(e.target.value)}>
              {clients.map((c) =>
              <option key={c.id} value={c.id}>{c.name}</option>
              )}
            </Select>
          </div>
          <div>
            <Label htmlFor="assign-plan">Plan</Label>
            <Select id="assign-plan" value={assignPlan} onChange={(e) => setAssignPlan(e.target.value)}>
              {tiers.map((t) =>
              <option key={t.id} value={t.name}>
                  {t.name} {t.price ? `— ${formatCurrency(t.price)}/mo` : '— Custom'}
                </option>
              )}
            </Select>
          </div>
        </div>
      </Modal>
    </div>);

}

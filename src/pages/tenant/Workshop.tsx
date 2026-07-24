import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { LayoutGridIcon, PlusIcon, CarIcon, UserIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input, Label, Select } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { Bay } from '../../types/bay';
import { Branch } from '../../types/branch';
import { api, ApiError } from '../../lib/api';

export function Workshop() {
  const [bays, setBays] = useState<Bay[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchFilter, setBranchFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [branchId, setBranchId] = useState('');
  const [saving, setSaving] = useState(false);

  const loadBays = () => {
    setLoading(true);
    api
      .get<{ bays: Bay[] }>(`/bays${branchFilter ? `?branchId=${branchFilter}` : ''}`)
      .then(({ bays }) => setBays(bays))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load bays'))
      .finally(() => setLoading(false));
  };

  useEffect(loadBays, [branchFilter]);
  useEffect(() => {
    api.get<{ branches: Branch[] }>('/branches').then(({ branches }) => setBranches(branches)).catch(() => setBranches([]));
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/bays', { name, branchId: branchId || undefined });
      toast.success(`${name} added`);
      setAddOpen(false);
      setName('');
      setBranchId('');
      loadBays();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to add bay');
    } finally {
      setSaving(false);
    }
  };

  const freeCount = bays.filter((b) => b.status === 'Free').length;

  return (
    <div>
      <PageHeader
        title="Bays"
        description={loading ? 'Your workshop’s physical work stations.' : `${freeCount} of ${bays.length} bays free right now.`}
        action={<Button onClick={() => setAddOpen(true)}><PlusIcon className="h-4 w-4" /> Add bay</Button>} />


      {branches.length > 1 &&
      <div className="mb-4 max-w-xs">
          <Select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
            <option value="">All branches</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </div>
      }

      {loading ?
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Card key={i} className="p-5"><Skeleton className="h-24 w-full" /></Card>)}
        </div> :
      bays.length === 0 ?
      <Card><EmptyState icon={LayoutGridIcon} title="No bays yet" description="Add your workshop's bays, then assign job cards to them from the Job Cards page." /></Card> :

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {bays.map((bay) =>
        <Card key={bay.id} className={`p-5 ${bay.status === 'Occupied' ? 'border-l-4 border-l-amber-400' : 'border-l-4 border-l-emerald-400'}`}>
              <div className="flex items-center justify-between">
                <p className="font-bold text-navy dark:text-slate-100">{bay.name}</p>
                <Badge tone={bay.status === 'Occupied' ? 'amber' : 'green'} dot>{bay.status}</Badge>
              </div>
              {bay.status === 'Occupied' ?
          <div className="mt-3 space-y-1.5 text-xs text-text-gray dark:text-slate-400">
                  <p className="flex items-center gap-1.5"><CarIcon className="h-3.5 w-3.5" /> {bay.vehicle}</p>
                  {bay.technician && <p className="flex items-center gap-1.5"><UserIcon className="h-3.5 w-3.5" /> {bay.technician}</p>}
                </div> :

          <p className="mt-3 text-xs text-text-gray dark:text-slate-400">Assign a job card to this bay from Job Cards.</p>
          }
            </Card>
        )}
        </div>
      }

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add bay"
        footer={
        <>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button form="add-bay-form" type="submit" loading={saving}>Add bay</Button>
          </>
        }>
        <form id="add-bay-form" onSubmit={handleAdd} className="space-y-4">
          <div>
            <Label htmlFor="bay-name">Bay name</Label>
            <Input id="bay-name" required placeholder="e.g. Bay 1" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {branches.length > 0 &&
          <div>
              <Label htmlFor="bay-branch">Branch (optional)</Label>
              <Select id="bay-branch" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                <option value="">— unassigned —</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </div>
          }
        </form>
      </Modal>
    </div>);

}

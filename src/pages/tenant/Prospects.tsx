import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { UserPlusIcon, PlusIcon, ArrowRightIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Label, Textarea } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { Prospect, ProspectSource, PROSPECT_SOURCES, ProspectStatus } from '../../types/prospect';
import { TenantUser } from '../../types/tenantUser';
import { api, ApiError } from '../../lib/api';

const STATUS_FILTERS: ('All' | ProspectStatus)[] = ['All', 'New', 'Contacted', 'Qualified', 'Converted', 'Lost'];
const STATUS_TONE: Record<ProspectStatus, 'blue' | 'amber' | 'teal' | 'green' | 'red'> = {
  New: 'blue',
  Contacted: 'amber',
  Qualified: 'teal',
  Converted: 'green',
  Lost: 'red',
};
const emptyForm = { name: '', phone: '', email: '', source: '' as ProspectSource | '', assignedTo: '', notes: '' };

export function Prospects() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [staff, setStaff] = useState<TenantUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'All' | ProspectStatus>('All');

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  const loadProspects = () => {
    setLoading(true);
    api
      .get<{ prospects: Prospect[] }>('/prospects')
      .then(({ prospects }) => setProspects(prospects))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load prospects'))
      .finally(() => setLoading(false));
  };

  useEffect(loadProspects, []);
  useEffect(() => {
    api.get<{ staff: TenantUser[] }>('/staff').then(({ staff }) => setStaff(staff)).catch(() => setStaff([]));
  }, []);

  const staffNameById = new Map(staff.map((s) => [s.id, s.name]));

  const openCreate = () => {
    setForm(emptyForm);
    setModalOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('A name is required');
      return;
    }
    setSaving(true);
    try {
      const { prospect } = await api.post<{ prospect: Prospect }>('/prospects', {
        name: form.name,
        phone: form.phone || undefined,
        email: form.email || undefined,
        source: form.source || undefined,
        assignedTo: form.assignedTo || undefined,
        notes: form.notes || undefined,
      });
      setProspects((prev) => [prospect, ...prev]);
      toast.success(`${prospect.name} added`);
      setModalOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to add prospect');
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (p: Prospect, status: ProspectStatus) => {
    const previous = prospects;
    setProspects((prev) => prev.map((x) => (x.id === p.id ? { ...x, status } : x)));
    try {
      await api.patch(`/prospects/${p.id}`, { status });
    } catch (err) {
      setProspects(previous);
      toast.error(err instanceof ApiError ? err.message : 'Failed to update prospect');
    }
  };

  const convert = async (p: Prospect) => {
    if (!p.email) {
      toast.error('This prospect needs an email before it can become a customer');
      return;
    }
    setActingId(p.id);
    try {
      await api.post(`/prospects/${p.id}/convert`);
      setProspects((prev) => prev.map((x) => (x.id === p.id ? { ...x, status: 'Converted' } : x)));
      toast.success(`${p.name} converted to a customer`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to convert prospect');
    } finally {
      setActingId(null);
    }
  };

  const filtered = prospects.filter((p) => statusFilter === 'All' || p.status === statusFilter);

  return (
    <div>
      <PageHeader
        title="Prospects"
        description="People you're trying to win as customers — not yet a real Customer record."
        action={<Button onClick={openCreate}><PlusIcon className="h-4 w-4" /> Add prospect</Button>} />


      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((s) =>
        <button
          key={s}
          onClick={() => setStatusFilter(s)}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${statusFilter === s ? 'bg-griptor-gradient text-white' : 'bg-soft-gray text-text-gray hover:bg-light-blue dark:bg-slate-800 dark:text-slate-300'}`}>

            {s}
          </button>
        )}
      </div>

      {loading ?
      <Card><div className="p-5"><TableSkeleton rows={6} /></div></Card> :
      filtered.length === 0 ?
      <Card><EmptyState icon={UserPlusIcon} title="No prospects" description="Add someone you're pursuing as a future customer." /></Card> :

      <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead>
                <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                  <th className="px-5 py-3 font-bold">Name</th>
                  <th className="px-5 py-3 font-bold">Contact</th>
                  <th className="px-5 py-3 font-bold">Source</th>
                  <th className="px-5 py-3 font-bold">Assigned to</th>
                  <th className="px-5 py-3 font-bold">Status</th>
                  <th className="px-5 py-3 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) =>
              <tr key={p.id} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                    <td className="px-5 py-3 font-semibold text-navy dark:text-slate-100">{p.name}</td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">{[p.email, p.phone].filter(Boolean).join(' · ') || '—'}</td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">{p.source ?? '—'}</td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">{p.assignedToName ?? staffNameById.get(p.assignedTo ?? '') ?? '—'}</td>
                    <td className="px-5 py-3">
                      {p.status === 'Converted' || p.status === 'Lost' ?
                  <Badge tone={STATUS_TONE[p.status]}>{p.status}</Badge> :

                  <Select aria-label="Status" value={p.status} onChange={(e) => setStatus(p, e.target.value as ProspectStatus)} className="w-auto">
                          <option value="New">New</option>
                          <option value="Contacted">Contacted</option>
                          <option value="Qualified">Qualified</option>
                          <option value="Lost">Lost</option>
                        </Select>
                  }
                    </td>
                    <td className="px-5 py-3 text-right">
                      {p.status !== 'Converted' && p.status !== 'Lost' &&
                  <Button size="sm" onClick={() => convert(p)} loading={actingId === p.id}><ArrowRightIcon className="h-3.5 w-3.5" /> Convert</Button>
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
        title="Add prospect"
        footer={
        <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button form="prospect-form" type="submit" loading={saving}>Add prospect</Button>
          </>
        }>
        <form id="prospect-form" onSubmit={save} className="space-y-4">
          <div>
            <Label htmlFor="pr-name">Name</Label>
            <Input id="pr-name" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="pr-phone">Phone (optional)</Label>
              <Input id="pr-phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="pr-email">Email (optional)</Label>
              <Input id="pr-email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label htmlFor="pr-source">Source (optional)</Label>
            <Select id="pr-source" value={form.source} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value as ProspectSource }))}>
              <option value="">— none —</option>
              {PROSPECT_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </div>
          {staff.length > 0 &&
          <div>
              <Label htmlFor="pr-assignee">Assign to (optional)</Label>
              <Select id="pr-assignee" value={form.assignedTo} onChange={(e) => setForm((f) => ({ ...f, assignedTo: e.target.value }))}>
                <option value="">— unassigned —</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </div>
          }
          <div>
            <Label htmlFor="pr-notes">Notes (optional)</Label>
            <Textarea id="pr-notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
        </form>
      </Modal>
    </div>);

}

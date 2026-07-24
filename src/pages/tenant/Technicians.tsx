import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { WrenchIcon, CheckCircle2Icon, BriefcaseIcon, PlusIcon, LogInIcon, CoffeeIcon, LogOutIcon, ClockIcon, HistoryIcon, PencilIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Avatar } from '../../components/ui/Avatar';
import { StatusBadge } from '../../components/StatusBadge';
import { Button } from '../../components/ui/Button';
import { Toggle } from '../../components/ui/Toggle';
import { Modal } from '../../components/ui/Modal';
import { Input, Label, Select } from '../../components/ui/Input';
import { CardSkeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { Technician, AttendanceHistoryEntry } from '../../types/technician';
import { Branch } from '../../types/branch';
import { formatCurrency, formatDate, cn } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

const emptyForm = { name: '', specialty: '', branchId: '', hourlyRate: '', maxConcurrentJobs: '4' };

function elapsedSince(iso?: string): string {
  if (!iso) return '';
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function Technicians() {
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchFilter, setBranchFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Technician | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [historyFor, setHistoryFor] = useState<Technician | null>(null);
  const [history, setHistory] = useState<AttendanceHistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const loadTechnicians = () => {
    setLoading(true);
    api
      .get<{ technicians: Technician[] }>(`/technicians${branchFilter ? `?branchId=${branchFilter}` : ''}`)
      .then(({ technicians }) => setTechnicians(technicians))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load technicians'))
      .finally(() => setLoading(false));
  };

  useEffect(loadTechnicians, [branchFilter]);
  useEffect(() => {
    api.get<{ branches: Branch[] }>('/branches').then(({ branches }) => setBranches(branches)).catch(() => setBranches([]));
  }, []);

  const clockAction = async (tech: Technician, action: 'clock_in' | 'start_break' | 'end_break' | 'clock_out') => {
    try {
      const { technician } = await api.post<{ technician: Technician }>(`/technicians/${tech.id}/attendance`, { action });
      setTechnicians((prev) => prev.map((t) => (t.id === tech.id ? { ...t, ...technician } : t)));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update attendance');
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setAddOpen(true);
  };

  const openEdit = (tech: Technician) => {
    setEditing(tech);
    setForm({
      name: tech.name,
      specialty: tech.specialty,
      branchId: tech.branchId ?? '',
      hourlyRate: tech.hourlyRate ? String(tech.hourlyRate) : '',
      maxConcurrentJobs: String(tech.maxConcurrentJobs),
    });
    setAddOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const body = {
      name: form.name,
      specialty: form.specialty,
      branchId: form.branchId || undefined,
      hourlyRate: form.hourlyRate ? Number(form.hourlyRate) : undefined,
      maxConcurrentJobs: Number(form.maxConcurrentJobs) || 4,
    };
    try {
      if (editing) {
        const { technician } = await api.patch<{ technician: Technician }>(`/technicians/${editing.id}`, body);
        setTechnicians((prev) => prev.map((t) => t.id === technician.id ? { ...t, ...technician } : t));
        toast.success(`${technician.name} updated`);
      } else {
        await api.post('/technicians', body);
        toast.success(`${form.name} added`);
        loadTechnicians();
      }
      setAddOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to save technician');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (tech: Technician) => {
    const previous = technicians;
    setTechnicians((prev) => prev.map((t) => t.id === tech.id ? { ...t, active: !t.active } : t));
    try {
      await api.patch(`/technicians/${tech.id}`, { active: !tech.active });
    } catch (err) {
      setTechnicians(previous);
      toast.error(err instanceof ApiError ? err.message : 'Failed to update technician');
    }
  };

  const openHistory = (tech: Technician) => {
    setHistoryFor(tech);
    setLoadingHistory(true);
    api
      .get<{ history: AttendanceHistoryEntry[] }>(`/technicians/${tech.id}/attendance-history`)
      .then(({ history }) => setHistory(history))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load attendance history'))
      .finally(() => setLoadingHistory(false));
  };

  return (
    <div>
      <PageHeader
        title="Technicians"
        description="Your workshop team and their current workload."
        action={<Button onClick={openCreate}><PlusIcon className="h-4 w-4" /> Add technician</Button>} />


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
          <CardSkeleton /><CardSkeleton /><CardSkeleton />
        </div> :
      technicians.length === 0 ?
      <Card><EmptyState icon={WrenchIcon} title="No technicians yet" description="Add your first team member to start assigning job cards." /></Card> :

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {technicians.map((t) =>
        <Card key={t.id} className={cn('p-5', !t.active && 'opacity-60')}>
            <div className="flex items-center gap-3">
              <Avatar name={t.name} src={t.avatar} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 font-bold text-navy dark:text-slate-100">
                  {t.name}
                  {!t.active && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-400 dark:bg-slate-800">Inactive</span>}
                </p>
                <p className="flex items-center gap-1 text-xs text-text-gray dark:text-slate-400">
                  <WrenchIcon className="h-3 w-3" /> {t.specialty}{t.hourlyRate ? ` · ${formatCurrency(t.hourlyRate)}/hr` : ''}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <StatusBadge status={t.status} />
                <div className="flex items-center gap-1">
                  <button onClick={() => openHistory(t)} aria-label={`${t.name}'s attendance history`} className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800">
                    <HistoryIcon className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => openEdit(t)} aria-label={`Edit ${t.name}`} className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800">
                    <PencilIcon className="h-3.5 w-3.5" />
                  </button>
                  <Toggle size="sm" checked={t.active} onChange={() => toggleActive(t)} label={`${t.active ? 'Deactivate' : 'Reactivate'} ${t.name}`} />
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-soft-gray p-3 dark:bg-slate-800/60">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-text-gray dark:text-slate-400">
                  <BriefcaseIcon className="h-3.5 w-3.5" /> Active jobs
                </div>
                <p className="mt-1 text-2xl font-extrabold text-navy dark:text-slate-100">{t.activeJobs}</p>
              </div>
              <div className="rounded-xl bg-soft-gray p-3 dark:bg-slate-800/60">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-text-gray dark:text-slate-400">
                  <CheckCircle2Icon className="h-3.5 w-3.5" /> Done today
                </div>
                <p className="mt-1 text-2xl font-extrabold text-navy dark:text-slate-100">{t.completedToday}</p>
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-1 flex items-center justify-between text-xs text-text-gray dark:text-slate-400">
                <span>Workload</span>
                <span>{Math.round(t.activeJobs / t.maxConcurrentJobs * 100)}% of {t.maxConcurrentJobs}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div className="h-full rounded-full bg-griptor-gradient-soft" style={{ width: `${Math.min(t.activeJobs / t.maxConcurrentJobs * 100, 100)}%` }} />
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-2 border-t border-border-soft pt-3 dark:border-slate-800">
              {t.attendanceStatus === 'active' && t.clockInAt &&
              <span className="flex items-center gap-1 text-xs text-text-gray dark:text-slate-400">
                  <ClockIcon className="h-3.5 w-3.5" /> {elapsedSince(t.clockInAt)} clocked in
                </span>
              }
              {t.attendanceStatus === 'on_break' &&
              <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                  <CoffeeIcon className="h-3.5 w-3.5" /> On break
                </span>
              }
              {t.attendanceStatus === 'off' && <span className="text-xs text-text-gray dark:text-slate-400">Not clocked in</span>}

              <div className="flex items-center gap-2">
                {t.attendanceStatus === 'off' &&
                <Button size="sm" variant="secondary" onClick={() => clockAction(t, 'clock_in')}>
                    <LogInIcon className="h-3.5 w-3.5" /> Clock in
                  </Button>
                }
                {t.attendanceStatus === 'active' &&
                <>
                    <Button size="sm" variant="ghost" onClick={() => clockAction(t, 'start_break')}>
                      <CoffeeIcon className="h-3.5 w-3.5" /> Break
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => clockAction(t, 'clock_out')}>
                      <LogOutIcon className="h-3.5 w-3.5" /> Clock out
                    </Button>
                  </>
                }
                {t.attendanceStatus === 'on_break' &&
                <Button size="sm" variant="secondary" onClick={() => clockAction(t, 'end_break')}>
                    End break
                  </Button>
                }
              </div>
            </div>
          </Card>
        )}
      </div>
      }

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={editing ? `Edit ${editing.name}` : 'Add technician'}
        footer={
        <>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button form="tech-form" type="submit" loading={saving}>{editing ? 'Save changes' : 'Add technician'}</Button>
          </>
        }>
        <form id="tech-form" onSubmit={save} className="space-y-4">
          <div>
            <Label htmlFor="tech-name">Full name</Label>
            <Input id="tech-name" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="tech-specialty">Specialty</Label>
            <Input id="tech-specialty" required placeholder="e.g. General Mechanic" value={form.specialty} onChange={(e) => setForm((f) => ({ ...f, specialty: e.target.value }))} />
          </div>
          {branches.length > 0 &&
          <div>
              <Label htmlFor="tech-branch">Branch (optional)</Label>
              <Select id="tech-branch" value={form.branchId} onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}>
                <option value="">— unassigned —</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </div>
          }
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="tech-rate">Hourly rate ($, optional)</Label>
              <Input id="tech-rate" type="number" min={0} value={form.hourlyRate} onChange={(e) => setForm((f) => ({ ...f, hourlyRate: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="tech-capacity">Max concurrent jobs</Label>
              <Input id="tech-capacity" type="number" min={1} value={form.maxConcurrentJobs} onChange={(e) => setForm((f) => ({ ...f, maxConcurrentJobs: e.target.value }))} />
            </div>
          </div>
        </form>
      </Modal>

      <Modal open={!!historyFor} onClose={() => setHistoryFor(null)} title={historyFor ? `${historyFor.name}'s attendance history` : ''}>
        {loadingHistory ?
        <p className="text-sm text-text-gray dark:text-slate-400">Loading…</p> :
        history.length === 0 ?
        <EmptyState icon={ClockIcon} title="No attendance recorded yet" description="Clock-ins will show up here." /> :

        <ul className="divide-y divide-border-soft dark:divide-slate-800">
            {history.map((h) =>
          <li key={h.date} className="flex items-center justify-between py-2.5 text-sm">
                <span className="text-navy dark:text-slate-100">{formatDate(h.date)}</span>
                <span className="text-text-gray dark:text-slate-400">
                  {h.hoursWorked !== null ? `${h.hoursWorked}h` : h.status === 'off' && !h.clockInAt ? '—' : 'In progress'}
                  {h.breakCount > 0 ? ` · ${h.breakCount} break${h.breakCount > 1 ? 's' : ''}` : ''}
                </span>
              </li>
          )}
          </ul>
        }
      </Modal>
    </div>);

}

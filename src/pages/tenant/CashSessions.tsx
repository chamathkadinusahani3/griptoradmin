import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { WalletIcon, PlusIcon, LockIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Label, Textarea } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { CashSession } from '../../types/cashSession';
import { Branch } from '../../types/branch';
import { formatCurrency, formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

export function CashSessions() {
  const [sessions, setSessions] = useState<CashSession[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);

  const [openModalOpen, setOpenModalOpen] = useState(false);
  const [openBranchId, setOpenBranchId] = useState('');
  const [openingFloat, setOpeningFloat] = useState('');
  const [openNotes, setOpenNotes] = useState('');
  const [opening, setOpening] = useState(false);

  const [closeTarget, setCloseTarget] = useState<CashSession | null>(null);
  const [closingAmount, setClosingAmount] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [closing, setClosing] = useState(false);

  const load = () => {
    setLoading(true);
    api
      .get<{ cashSessions: CashSession[] }>('/cash-sessions')
      .then(({ cashSessions }) => setSessions(cashSessions))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load cash sessions'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);
  useEffect(() => {
    api.get<{ branches: Branch[] }>('/branches').then(({ branches }) => setBranches(branches)).catch(() => setBranches([]));
  }, []);

  const branchNameById = new Map(branches.map((b) => [b.id, b.name]));
  const hasOpenSession = sessions.some((s) => s.status === 'Open' && (s.branchId ?? '') === (openBranchId || ''));

  const openCreate = () => {
    setOpenBranchId('');
    setOpeningFloat('');
    setOpenNotes('');
    setOpenModalOpen(true);
  };

  const submitOpen = async (e: React.FormEvent) => {
    e.preventDefault();
    const float = Number(openingFloat);
    if (!openingFloat || float < 0) {
      toast.error('Enter a valid opening float (0 or more)');
      return;
    }
    setOpening(true);
    try {
      const { cashSession } = await api.post<{ cashSession: CashSession }>('/cash-sessions', {
        branchId: openBranchId || undefined,
        openingFloat: float,
        notes: openNotes || undefined,
      });
      setSessions((prev) => [cashSession, ...prev]);
      toast.success('Cash session opened');
      setOpenModalOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to open cash session');
    } finally {
      setOpening(false);
    }
  };

  const openClose = (session: CashSession) => {
    setCloseTarget(session);
    setClosingAmount('');
    setCloseNotes('');
  };

  const submitClose = async () => {
    if (!closeTarget) return;
    const counted = Number(closingAmount);
    if (!closingAmount || counted < 0) {
      toast.error('Enter the amount actually counted in the drawer');
      return;
    }
    setClosing(true);
    try {
      const { cashSession } = await api.post<{ cashSession: CashSession }>(`/cash-sessions/${closeTarget.id}/close`, {
        closingCountedAmount: counted,
        notes: closeNotes || undefined,
      });
      setSessions((prev) => prev.map((s) => (s.id === cashSession.id ? cashSession : s)));
      toast.success(cashSession.variance === 0 ? 'Session closed — drawer balanced' : `Session closed — variance ${formatCurrency(cashSession.variance ?? 0)}`);
      setCloseTarget(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to close cash session');
    } finally {
      setClosing(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Cash Sessions"
        description="Open a till with a starting float, close it by counting the drawer — expected cash is derived from cash sales, cash invoice payments, expenses, and cash supplier payments during the session."
        action={<Button onClick={openCreate}><PlusIcon className="h-4 w-4" /> Open session</Button>} />


      {loading ?
      <Card><div className="p-5"><TableSkeleton rows={6} /></div></Card> :
      sessions.length === 0 ?
      <Card><EmptyState icon={WalletIcon} title="No cash sessions yet" description="Open a session at the start of the day to reconcile the till at the end." /></Card> :

      <Card>
          <ul className="divide-y divide-border-soft dark:divide-slate-800">
            {sessions.map((s) =>
          <li key={s.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-1.5 font-bold text-navy dark:text-slate-100">
                      {s.branchId ? branchNameById.get(s.branchId) ?? 'Unknown branch' : 'All branches'}
                      <Badge tone={s.status === 'Open' ? 'amber' : 'green'}>{s.status}</Badge>
                    </p>
                    <p className="text-xs text-text-gray dark:text-slate-400">
                      Opened by {s.openedByName ?? '—'} · {formatDate(s.createdAt)} · Float {formatCurrency(s.openingFloat)}
                    </p>
                  </div>
                  {s.status === 'Open' && <Button size="sm" onClick={() => openClose(s)}><LockIcon className="h-3.5 w-3.5" /> Close session</Button>}
                </div>
                {s.status === 'Closed' &&
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
                    <div className="rounded-xl bg-soft-gray p-2.5 text-center dark:bg-slate-800/60">
                      <p className="text-xs text-text-gray dark:text-slate-400">Cash in</p>
                      <p className="font-bold text-navy dark:text-slate-100">{formatCurrency(s.expectedCashIn ?? 0)}</p>
                    </div>
                    <div className="rounded-xl bg-soft-gray p-2.5 text-center dark:bg-slate-800/60">
                      <p className="text-xs text-text-gray dark:text-slate-400">Cash out</p>
                      <p className="font-bold text-navy dark:text-slate-100">{formatCurrency(s.expectedCashOut ?? 0)}</p>
                    </div>
                    <div className="rounded-xl bg-soft-gray p-2.5 text-center dark:bg-slate-800/60">
                      <p className="text-xs text-text-gray dark:text-slate-400">Expected</p>
                      <p className="font-bold text-navy dark:text-slate-100">{formatCurrency(s.expectedClosingAmount ?? 0)}</p>
                    </div>
                    <div className="rounded-xl bg-soft-gray p-2.5 text-center dark:bg-slate-800/60">
                      <p className="text-xs text-text-gray dark:text-slate-400">Counted</p>
                      <p className="font-bold text-navy dark:text-slate-100">{formatCurrency(s.closingCountedAmount ?? 0)}</p>
                    </div>
                    <div className={`rounded-xl p-2.5 text-center ${s.variance ? 'bg-red-50 dark:bg-red-500/10' : 'bg-emerald-50 dark:bg-emerald-500/10'}`}>
                      <p className="text-xs text-text-gray dark:text-slate-400">Variance</p>
                      <p className={`font-bold ${s.variance ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{formatCurrency(s.variance ?? 0)}</p>
                    </div>
                  </div>
            }
              </li>
          )}
          </ul>
        </Card>
      }

      <Modal
        open={openModalOpen}
        onClose={() => setOpenModalOpen(false)}
        title="Open cash session"
        footer={
        <>
            <Button variant="secondary" onClick={() => setOpenModalOpen(false)}>Cancel</Button>
            <Button form="open-session-form" type="submit" loading={opening} disabled={hasOpenSession}>Open session</Button>
          </>
        }>
        <form id="open-session-form" onSubmit={submitOpen} className="space-y-4">
          {branches.length > 0 &&
          <div>
              <Label htmlFor="cs-branch">Branch (optional)</Label>
              <Select id="cs-branch" value={openBranchId} onChange={(e) => setOpenBranchId(e.target.value)}>
                <option value="">— all branches —</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </div>
          }
          {hasOpenSession && <p className="text-xs text-red-600 dark:text-red-400">A session is already open for this scope — close it first.</p>}
          <div>
            <Label htmlFor="cs-float">Opening float</Label>
            <Input id="cs-float" type="number" min={0} value={openingFloat} onChange={(e) => setOpeningFloat(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="cs-notes">Notes (optional)</Label>
            <Textarea id="cs-notes" value={openNotes} onChange={(e) => setOpenNotes(e.target.value)} />
          </div>
        </form>
      </Modal>

      <Modal
        open={!!closeTarget}
        onClose={() => setCloseTarget(null)}
        title="Close cash session"
        footer={
        <>
            <Button variant="secondary" onClick={() => setCloseTarget(null)}>Cancel</Button>
            <Button onClick={submitClose} loading={closing}>Close session</Button>
          </>
        }>
        <div className="space-y-4">
          <div>
            <Label htmlFor="cs-counted">Amount counted in the drawer</Label>
            <Input id="cs-counted" type="number" min={0} value={closingAmount} onChange={(e) => setClosingAmount(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="cs-close-notes">Notes (optional)</Label>
            <Textarea id="cs-close-notes" value={closeNotes} onChange={(e) => setCloseNotes(e.target.value)} />
          </div>
        </div>
      </Modal>
    </div>);

}

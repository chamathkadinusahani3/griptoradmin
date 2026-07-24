import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ClipboardCheckIcon, PlusIcon, CheckIcon, XIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { StatCard } from '../../components/ui/StatCard';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Label } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { Approval, ApprovalType, ApprovalStatus } from '../../types/approval';
import { formatDate, formatCurrency } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

const TYPES: ApprovalType[] = ['Discount Authorization', 'Refund Request', 'Credit Limit Override', 'Warranty Claim', 'Other'];
const STATUS_TONE: Record<ApprovalStatus, 'amber' | 'green' | 'red'> = { Pending: 'amber', Approved: 'green', Rejected: 'red' };
const emptyForm = { type: 'Discount Authorization' as ApprovalType, subject: '', amount: '' };

export function Approvals() {
  const { user } = useAuth();
  // Server-enforced (requireTenantManager) — this is UX only, so a
  // Technician/Cashier isn't shown a control they'd just get a 403 from.
  const canRespond = user?.tenantRole === 'Owner' || user?.tenantRole === 'Manager';
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  const loadApprovals = () => {
    api
      .get<{ approvals: Approval[] }>('/approvals')
      .then(({ approvals }) => setApprovals(approvals))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load approvals'));
  };

  useEffect(loadApprovals, []);

  const pending = approvals.filter((a) => a.status === 'Pending').length;
  const approved = approvals.filter((a) => a.status === 'Approved').length;
  const rejected = approvals.filter((a) => a.status === 'Rejected').length;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/approvals', { ...form, amount: form.amount ? Number(form.amount) : undefined });
      toast.success('Request submitted');
      setAddOpen(false);
      setForm(emptyForm);
      loadApprovals();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to submit request');
    } finally {
      setSaving(false);
    }
  };

  const respond = async (approval: Approval, status: 'Approved' | 'Rejected') => {
    setRespondingId(approval.id);
    try {
      const { approval: updated } = await api.patch<{ approval: Approval }>(`/approvals/${approval.id}`, { status });
      setApprovals((prev) => prev.map((a) => a.id === updated.id ? updated : a));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to respond');
    } finally {
      setRespondingId(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Approvals"
        description="Discount, refund, and credit override requests — a real audit trail."
        action={<Button onClick={() => setAddOpen(true)}><PlusIcon className="h-4 w-4" /> New request</Button>} />


      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Pending" value={String(pending)} icon={ClipboardCheckIcon} hint="awaiting response" />
        <StatCard label="Approved" value={String(approved)} icon={CheckIcon} hint="all time" />
        <StatCard label="Rejected" value={String(rejected)} icon={XIcon} hint="all time" />
      </div>

      <Card>
        {approvals.length === 0 ?
        <EmptyState icon={ClipboardCheckIcon} title="No requests yet" description="Submit your first approval request." /> :

        <ul className="divide-y divide-border-soft dark:divide-slate-800">
            {approvals.map((a) =>
          <li key={a.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-navy dark:text-slate-100">{a.subject}</p>
                  <p className="text-xs text-text-gray dark:text-slate-400">
                    {a.type}{a.amount ? ` · ${formatCurrency(a.amount)}` : ''} · Requested by {a.requestedByName ?? 'Unknown'} · {formatDate(a.createdAt)}
                    {a.respondedByName && ` · ${a.status} by ${a.respondedByName}`}
                  </p>
                </div>
                <Badge tone={STATUS_TONE[a.status]}>{a.status}</Badge>
                {a.status === 'Pending' && canRespond &&
            <div className="flex gap-2">
                    <Button size="sm" variant="secondary" loading={respondingId === a.id} onClick={() => respond(a, 'Approved')}><CheckIcon className="h-3.5 w-3.5" /> Approve</Button>
                    <Button size="sm" variant="secondary" loading={respondingId === a.id} onClick={() => respond(a, 'Rejected')}><XIcon className="h-3.5 w-3.5" /> Reject</Button>
                  </div>
            }
              </li>
          )}
          </ul>
        }
      </Card>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="New approval request"
        footer={
        <>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button form="add-approval-form" type="submit" loading={saving}>Submit</Button>
          </>
        }>
        <form id="add-approval-form" onSubmit={handleAdd} className="space-y-4">
          <div>
            <Label htmlFor="ap-type">Type</Label>
            <Select id="ap-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as ApprovalType })}>
              {TYPES.map((t) => <option key={t}>{t}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="ap-subject">Subject</Label>
            <Input id="ap-subject" required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="e.g. 15% discount for John Doe's fleet renewal" />
          </div>
          <div>
            <Label htmlFor="ap-amount">Amount (optional)</Label>
            <Input id="ap-amount" type="number" min={0} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
        </form>
      </Modal>
    </div>);

}

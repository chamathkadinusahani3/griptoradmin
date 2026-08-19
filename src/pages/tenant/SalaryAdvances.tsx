import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { BanknoteIcon, PlusIcon, CheckIcon, XIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Label, Textarea } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { SalaryAdvance } from '../../types/salaryAdvance';
import { Technician } from '../../types/technician';
import { Employee } from '../../types/employee';
import { formatCurrency, formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';
import { useHasPermission } from '../../context/AuthContext';

const STATUS_TONE: Record<SalaryAdvance['status'], 'amber' | 'green' | 'red'> = { Pending: 'amber', Approved: 'green', Rejected: 'red' };
const PAYMENT_METHODS = ['Cash', 'Card', 'Bank Transfer', 'Cheque', 'Other'] as const;

export function SalaryAdvances() {
  const canApprove = useHasPermission('approvals:respond');
  const [advances, setAdvances] = useState<SalaryAdvance[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [subjectKey, setSubjectKey] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const [approveTarget, setApproveTarget] = useState<SalaryAdvance | null>(null);
  const [approvePaymentMethod, setApprovePaymentMethod] = useState<(typeof PAYMENT_METHODS)[number]>('Bank Transfer');
  const [rejectTarget, setRejectTarget] = useState<SalaryAdvance | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [reviewing, setReviewing] = useState(false);

  const loadAdvances = () => {
    setLoading(true);
    api
      .get<{ advances: SalaryAdvance[] }>('/salary-advances')
      .then(({ advances }) => setAdvances(advances))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load salary advances'))
      .finally(() => setLoading(false));
  };

  useEffect(loadAdvances, []);
  useEffect(() => {
    api.get<{ technicians: Technician[] }>('/technicians').then(({ technicians }) => setTechnicians(technicians)).catch(() => setTechnicians([]));
    api.get<{ employees: Employee[] }>('/employees').then(({ employees }) => setEmployees(employees.filter((e) => e.hasProfile))).catch(() => setEmployees([]));
  }, []);

  const openCreate = () => {
    setSubjectKey('');
    setAmount('');
    setReason('');
    setModalOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const [subjectType, subjectId] = subjectKey.split(':');
    const amt = Number(amount);
    if (!subjectType || !subjectId || !amt || amt <= 0) {
      toast.error('A person and a positive amount are required');
      return;
    }
    setSaving(true);
    try {
      const { advance } = await api.post<{ advance: SalaryAdvance }>('/salary-advances', {
        subjectType,
        subjectId,
        amount: amt,
        reason: reason || undefined,
      });
      setAdvances((prev) => [advance, ...prev]);
      toast.success(`${advance.advanceNumber} requested`);
      setModalOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to request advance');
    } finally {
      setSaving(false);
    }
  };

  const submitApprove = async () => {
    if (!approveTarget) return;
    setReviewing(true);
    try {
      const { advance } = await api.patch<{ advance: SalaryAdvance }>(`/salary-advances/${approveTarget.id}`, {
        action: 'approve',
        paymentMethod: approvePaymentMethod,
      });
      setAdvances((prev) => prev.map((x) => (x.id === advance.id ? advance : x)));
      toast.success(`${advance.advanceNumber} approved and paid out`);
      setApproveTarget(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to approve advance');
    } finally {
      setReviewing(false);
    }
  };

  const reject = async () => {
    if (!rejectTarget || !rejectionReason.trim()) {
      toast.error('A rejection reason is required');
      return;
    }
    setReviewing(true);
    try {
      const { advance } = await api.patch<{ advance: SalaryAdvance }>(`/salary-advances/${rejectTarget.id}`, { action: 'reject', rejectionReason });
      setAdvances((prev) => prev.map((x) => (x.id === advance.id ? advance : x)));
      toast.success(`${advance.advanceNumber} rejected`);
      setRejectTarget(null);
      setRejectionReason('');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to reject advance');
    } finally {
      setReviewing(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Salary Advances"
        description="Cash advances to staff — approving pays out immediately. Not yet auto-deducted from a future payroll run."
        action={<Button onClick={openCreate} disabled={technicians.length === 0 && employees.length === 0}><PlusIcon className="h-4 w-4" /> Request advance</Button>} />


      {loading ?
      <Card><div className="p-5"><TableSkeleton rows={6} /></div></Card> :
      advances.length === 0 ?
      <Card><EmptyState icon={BanknoteIcon} title="No advances yet" description="Request a cash advance for a technician or employee." /></Card> :

      <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead>
                <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                  <th className="px-5 py-3 font-bold">Advance</th>
                  <th className="px-5 py-3 font-bold">Person</th>
                  <th className="px-5 py-3 text-right font-bold">Amount</th>
                  <th className="px-5 py-3 font-bold">Status</th>
                  <th className="px-5 py-3 font-bold">Date</th>
                  <th className="px-5 py-3 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {advances.map((a) =>
              <tr key={a.id} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                    <td className="px-5 py-3 font-bold text-navy dark:text-slate-100">{a.advanceNumber}</td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-300">{a.subjectName}</td>
                    <td className="px-5 py-3 text-right text-navy dark:text-slate-100">{formatCurrency(a.amount)}</td>
                    <td className="px-5 py-3">
                      <Badge tone={STATUS_TONE[a.status]}>{a.status}</Badge>
                      {a.status === 'Rejected' && a.rejectionReason && <p className="mt-1 text-xs text-text-gray dark:text-slate-400">{a.rejectionReason}</p>}
                    </td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">{formatDate(a.createdAt)}</td>
                    <td className="px-5 py-3 text-right">
                      {a.status === 'Pending' && canApprove &&
                  <div className="flex justify-end gap-1.5">
                          <Button size="sm" variant="secondary" onClick={() => { setApproveTarget(a); setApprovePaymentMethod('Bank Transfer'); }}><CheckIcon className="h-3.5 w-3.5" /> Approve</Button>
                          <Button size="sm" variant="secondary" onClick={() => setRejectTarget(a)}><XIcon className="h-3.5 w-3.5" /> Reject</Button>
                        </div>
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
        title="Request salary advance"
        footer={
        <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button form="advance-form" type="submit" loading={saving}>Request</Button>
          </>
        }>
        <form id="advance-form" onSubmit={save} className="space-y-4">
          <div>
            <Label htmlFor="adv-subject">Person</Label>
            <Select id="adv-subject" value={subjectKey} onChange={(e) => setSubjectKey(e.target.value)}>
              <option value="">— select a person —</option>
              {technicians.length > 0 &&
              <optgroup label="Technicians">
                  {technicians.map((t) => <option key={t.id} value={`technician:${t.id}`}>{t.name}</option>)}
                </optgroup>
            }
              {employees.length > 0 &&
              <optgroup label="Employees">
                  {employees.map((e) => <option key={e.employeeId} value={`employee:${e.employeeId}`}>{e.name}</option>)}
                </optgroup>
            }
            </Select>
          </div>
          <div>
            <Label htmlFor="adv-amount">Amount</Label>
            <Input id="adv-amount" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="adv-reason">Reason (optional)</Label>
            <Textarea id="adv-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </form>
      </Modal>

      <Modal
        open={!!approveTarget}
        onClose={() => setApproveTarget(null)}
        title={approveTarget ? `Approve ${approveTarget.advanceNumber}` : 'Approve advance'}
        footer={
        <>
            <Button variant="secondary" onClick={() => setApproveTarget(null)}>Cancel</Button>
            <Button onClick={submitApprove} loading={reviewing}>Approve &amp; pay out</Button>
          </>
        }>
        <div>
          <Label htmlFor="adv-pay-method">Paid via</Label>
          <Select id="adv-pay-method" value={approvePaymentMethod} onChange={(e) => setApprovePaymentMethod(e.target.value as typeof approvePaymentMethod)}>
            {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
        </div>
      </Modal>

      <Modal
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        title={rejectTarget ? `Reject ${rejectTarget.advanceNumber}` : 'Reject advance'}
        footer={
        <>
            <Button variant="secondary" onClick={() => setRejectTarget(null)}>Cancel</Button>
            <Button onClick={reject} loading={reviewing}>Reject</Button>
          </>
        }>
        <div>
          <Label htmlFor="adv-reject-reason">Reason</Label>
          <Textarea id="adv-reject-reason" required value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} />
        </div>
      </Modal>
    </div>);

}

import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ClipboardCheckIcon, PlusIcon, TrashIcon, CheckIcon, XIcon, SendIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input, Label, Textarea } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { PurchaseRequisition, RequisitionLine, PurchaseRequisitionStatus } from '../../types/purchaseRequisition';
import { RFQ } from '../../types/rfq';
import { Part } from '../../types/part';
import { Supplier } from '../../types/supplier';
import { formatCurrency, formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';
import { useHasPermission } from '../../context/AuthContext';

const STATUS_TONE: Record<PurchaseRequisitionStatus, 'gray' | 'amber' | 'green' | 'red' | 'blue'> = {
  Pending: 'amber',
  Approved: 'green',
  Rejected: 'red',
  Converted: 'blue',
};

const emptyLine: RequisitionLine = { name: '', quantity: 1, estimatedUnitCost: undefined };
const emptyForm = { notes: '' };

export function PurchaseRequisitions() {
  const canApprove = useHasPermission('approvals:respond');
  const [requisitions, setRequisitions] = useState<PurchaseRequisition[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [lines, setLines] = useState<RequisitionLine[]>([{ ...emptyLine }]);
  const [saving, setSaving] = useState(false);

  const [rejectTarget, setRejectTarget] = useState<PurchaseRequisition | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [reviewing, setReviewing] = useState(false);

  const [rfqTarget, setRfqTarget] = useState<PurchaseRequisition | null>(null);
  const [rfqSupplierIds, setRfqSupplierIds] = useState<string[]>([]);
  const [rfqDueDate, setRfqDueDate] = useState('');
  const [sendingRfq, setSendingRfq] = useState(false);

  const loadRequisitions = () => {
    setLoading(true);
    api
      .get<{ requisitions: PurchaseRequisition[] }>('/purchase-requisitions')
      .then(({ requisitions }) => setRequisitions(requisitions))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load purchase requisitions'))
      .finally(() => setLoading(false));
  };

  useEffect(loadRequisitions, []);
  useEffect(() => {
    api.get<{ parts: Part[] }>('/parts').then(({ parts }) => setParts(parts)).catch(() => setParts([]));
    api.get<{ suppliers: Supplier[] }>('/suppliers').then(({ suppliers }) => setSuppliers(suppliers)).catch(() => setSuppliers([]));
  }, []);

  const openCreate = () => {
    setForm(emptyForm);
    setLines([{ ...emptyLine }]);
    setModalOpen(true);
  };

  const updateLine = (i: number, patch: Partial<RequisitionLine>) => {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  };
  const addLine = () => setLines((prev) => [...prev, { ...emptyLine }]);
  const removeLine = (i: number) => setLines((prev) => prev.filter((_, idx) => idx !== i));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const validLines = lines.filter((l) => l.name.trim() && l.quantity > 0);
    if (validLines.length === 0) {
      toast.error('At least one item with a name and quantity is required');
      return;
    }
    setSaving(true);
    try {
      const { requisition } = await api.post<{ requisition: PurchaseRequisition }>('/purchase-requisitions', {
        items: validLines,
        notes: form.notes || undefined,
      });
      setRequisitions((prev) => [requisition, ...prev]);
      toast.success(`${requisition.requisitionNumber} submitted`);
      setModalOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to submit requisition');
    } finally {
      setSaving(false);
    }
  };

  const approve = async (r: PurchaseRequisition) => {
    setReviewing(true);
    try {
      const { requisition } = await api.patch<{ requisition: PurchaseRequisition }>(`/purchase-requisitions/${r.id}`, { action: 'approve' });
      setRequisitions((prev) => prev.map((x) => (x.id === requisition.id ? requisition : x)));
      toast.success(`${requisition.requisitionNumber} approved`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to approve requisition');
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
      const { requisition } = await api.patch<{ requisition: PurchaseRequisition }>(`/purchase-requisitions/${rejectTarget.id}`, {
        action: 'reject',
        rejectionReason,
      });
      setRequisitions((prev) => prev.map((x) => (x.id === requisition.id ? requisition : x)));
      toast.success(`${requisition.requisitionNumber} rejected`);
      setRejectTarget(null);
      setRejectionReason('');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to reject requisition');
    } finally {
      setReviewing(false);
    }
  };

  const openSendForQuotes = (r: PurchaseRequisition) => {
    setRfqTarget(r);
    setRfqSupplierIds([]);
    setRfqDueDate('');
  };

  const toggleRfqSupplier = (id: string) => {
    setRfqSupplierIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  };

  const sendForQuotes = async () => {
    if (!rfqTarget || rfqSupplierIds.length === 0) {
      toast.error('Select at least one supplier');
      return;
    }
    setSendingRfq(true);
    try {
      const { rfq } = await api.post<{ rfq: RFQ }>(`/purchase-requisitions/${rfqTarget.id}/convert-to-rfq`, {
        supplierIds: rfqSupplierIds,
        dueDate: rfqDueDate || undefined,
      });
      setRequisitions((prev) => prev.map((x) => (x.id === rfqTarget.id ? { ...x, status: 'Converted' } : x)));
      toast.success(`${rfq.rfqNumber} sent to ${rfqSupplierIds.length} supplier${rfqSupplierIds.length === 1 ? '' : 's'}`);
      setRfqTarget(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to send RFQ');
    } finally {
      setSendingRfq(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Purchase Requisitions"
        description="Internal requests to buy — before any supplier is involved."
        action={<Button onClick={openCreate}><PlusIcon className="h-4 w-4" /> New requisition</Button>} />


      {loading ?
      <Card><div className="p-5"><TableSkeleton rows={6} /></div></Card> :
      requisitions.length === 0 ?
      <Card><EmptyState icon={ClipboardCheckIcon} title="No requisitions yet" description="Request items your garage needs to buy — a Manager approves before it moves to sourcing suppliers." /></Card> :

      <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                  <th className="px-5 py-3 font-bold">Requisition</th>
                  <th className="px-5 py-3 font-bold">Requested by</th>
                  <th className="px-5 py-3 font-bold">Items</th>
                  <th className="px-5 py-3 text-right font-bold">Est. total</th>
                  <th className="px-5 py-3 font-bold">Status</th>
                  <th className="px-5 py-3 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {requisitions.map((r) =>
              <tr key={r.id} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                    <td className="px-5 py-3">
                      <p className="font-bold text-navy dark:text-slate-100">{r.requisitionNumber}</p>
                      <p className="text-xs text-text-gray dark:text-slate-400">{formatDate(r.createdAt)}</p>
                    </td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-300">{r.requestedByName ?? '—'}</td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">{r.items.map((i) => i.name).join(', ')}</td>
                    <td className="px-5 py-3 text-right text-navy dark:text-slate-100">{formatCurrency(r.estimatedTotal)}</td>
                    <td className="px-5 py-3">
                      <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
                      {r.status === 'Rejected' && r.rejectionReason && <p className="mt-1 text-xs text-text-gray dark:text-slate-400">{r.rejectionReason}</p>}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {r.status === 'Pending' && canApprove &&
                    <>
                            <Button size="sm" variant="secondary" onClick={() => approve(r)} loading={reviewing}><CheckIcon className="h-3.5 w-3.5" /> Approve</Button>
                            <Button size="sm" variant="secondary" onClick={() => setRejectTarget(r)}><XIcon className="h-3.5 w-3.5" /> Reject</Button>
                          </>
                    }
                        {r.status === 'Approved' &&
                    <Button size="sm" onClick={() => openSendForQuotes(r)}><SendIcon className="h-3.5 w-3.5" /> Send for quotes</Button>
                    }
                      </div>
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
        title="New purchase requisition"
        size="lg"
        footer={
        <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button form="requisition-form" type="submit" loading={saving}>Submit</Button>
          </>
        }>
        <form id="requisition-form" onSubmit={save} className="space-y-4">
          <div className="space-y-2">
            <Label>Items</Label>
            {lines.map((line, i) =>
            <div key={i} className="grid grid-cols-12 items-center gap-2">
                <input
                list="requisition-part-options"
                placeholder="Item name"
                value={line.name}
                onChange={(e) => updateLine(i, { name: e.target.value })}
                className="col-span-6 h-10 rounded-lg border border-border-soft bg-white px-3 text-sm text-navy dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />

                <Input type="number" min={1} placeholder="Qty" value={line.quantity || ''} onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })} className="col-span-2" />
                <Input type="number" min={0} placeholder="Est. cost" value={line.estimatedUnitCost ?? ''} onChange={(e) => updateLine(i, { estimatedUnitCost: e.target.value ? Number(e.target.value) : undefined })} className="col-span-3" />
                <button type="button" onClick={() => removeLine(i)} className="col-span-1 flex items-center justify-center text-red-500 hover:text-red-600"><TrashIcon className="h-4 w-4" /></button>
              </div>
            )}
            <datalist id="requisition-part-options">
              {parts.map((p) => <option key={p.id} value={p.name} />)}
            </datalist>
            <Button type="button" variant="secondary" size="sm" onClick={addLine}><PlusIcon className="h-3.5 w-3.5" /> Add item</Button>
          </div>
          <div>
            <Label htmlFor="req-notes">Notes (optional)</Label>
            <Textarea id="req-notes" value={form.notes} onChange={(e) => setForm({ notes: e.target.value })} />
          </div>
        </form>
      </Modal>

      <Modal
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        title={rejectTarget ? `Reject ${rejectTarget.requisitionNumber}` : 'Reject requisition'}
        footer={
        <>
            <Button variant="secondary" onClick={() => setRejectTarget(null)}>Cancel</Button>
            <Button onClick={reject} loading={reviewing}>Reject</Button>
          </>
        }>
        <div>
          <Label htmlFor="reject-reason">Reason</Label>
          <Textarea id="reject-reason" required value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} />
        </div>
      </Modal>

      <Modal
        open={!!rfqTarget}
        onClose={() => setRfqTarget(null)}
        title={rfqTarget ? `Send ${rfqTarget.requisitionNumber} for quotes` : 'Send for quotes'}
        footer={
        <>
            <Button variant="secondary" onClick={() => setRfqTarget(null)}>Cancel</Button>
            <Button onClick={sendForQuotes} loading={sendingRfq}>Send RFQ</Button>
          </>
        }>
        <div className="space-y-4">
          <div>
            <Label>Suppliers to request quotes from</Label>
            {suppliers.length === 0 ?
            <p className="text-xs text-text-gray dark:text-slate-400">Add a supplier first.</p> :

            <div className="space-y-1.5">
                {suppliers.map((s) =>
              <label key={s.id} className="flex items-center gap-2 text-sm text-navy dark:text-slate-200">
                    <input type="checkbox" checked={rfqSupplierIds.includes(s.id)} onChange={() => toggleRfqSupplier(s.id)} className="h-4 w-4 rounded border-border-soft text-teal focus:ring-teal dark:border-slate-700" />
                    {s.name}
                  </label>
              )}
              </div>
            }
          </div>
          <div>
            <Label htmlFor="rfq-due">Quotes due by (optional)</Label>
            <Input id="rfq-due" type="date" value={rfqDueDate} onChange={(e) => setRfqDueDate(e.target.value)} />
          </div>
        </div>
      </Modal>
    </div>);

}

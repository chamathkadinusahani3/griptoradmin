import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { SendIcon, PlusIcon, TrashIcon, CheckIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Label } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { RFQ, RFQLine } from '../../types/rfq';
import { SupplierQuotation, SupplierQuotationLine } from '../../types/supplierQuotation';
import { Part } from '../../types/part';
import { Supplier } from '../../types/supplier';
import { PurchaseOrder } from '../../types/purchaseOrder';
import { formatCurrency, formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

const emptyLine: RFQLine = { name: '', quantity: 1 };
const emptyQuoteLine: SupplierQuotationLine = { name: '', quantity: 1, unitCost: 0 };

export function RFQs() {
  const [rfqs, setRfqs] = useState<RFQ[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [createLines, setCreateLines] = useState<RFQLine[]>([{ ...emptyLine }]);
  const [createSupplierIds, setCreateSupplierIds] = useState<string[]>([]);
  const [createDueDate, setCreateDueDate] = useState('');
  const [creating, setCreating] = useState(false);

  const [selected, setSelected] = useState<RFQ | null>(null);
  const [quotations, setQuotations] = useState<SupplierQuotation[]>([]);
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [quoteSupplierId, setQuoteSupplierId] = useState('');
  const [quoteLines, setQuoteLines] = useState<SupplierQuotationLine[]>([{ ...emptyQuoteLine }]);
  const [savingQuote, setSavingQuote] = useState(false);
  const [selectingId, setSelectingId] = useState<string | null>(null);

  const loadRfqs = () => {
    setLoading(true);
    api
      .get<{ rfqs: RFQ[] }>('/rfqs')
      .then(({ rfqs }) => setRfqs(rfqs))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load RFQs'))
      .finally(() => setLoading(false));
  };

  useEffect(loadRfqs, []);
  useEffect(() => {
    api.get<{ parts: Part[] }>('/parts').then(({ parts }) => setParts(parts)).catch(() => setParts([]));
    api.get<{ suppliers: Supplier[] }>('/suppliers').then(({ suppliers }) => setSuppliers(suppliers)).catch(() => setSuppliers([]));
  }, []);

  const openCreate = () => {
    setCreateLines([{ ...emptyLine }]);
    setCreateSupplierIds([]);
    setCreateDueDate('');
    setCreateOpen(true);
  };

  const updateCreateLine = (i: number, patch: Partial<RFQLine>) => setCreateLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addCreateLine = () => setCreateLines((prev) => [...prev, { ...emptyLine }]);
  const removeCreateLine = (i: number) => setCreateLines((prev) => prev.filter((_, idx) => idx !== i));
  const toggleCreateSupplier = (id: string) => setCreateSupplierIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));

  const createRfq = async (e: React.FormEvent) => {
    e.preventDefault();
    const validLines = createLines.filter((l) => l.name.trim() && l.quantity > 0);
    if (validLines.length === 0 || createSupplierIds.length === 0) {
      toast.error('At least one item and one supplier are required');
      return;
    }
    setCreating(true);
    try {
      const { rfq } = await api.post<{ rfq: RFQ }>('/rfqs', {
        items: validLines,
        supplierIds: createSupplierIds,
        dueDate: createDueDate || undefined,
      });
      setRfqs((prev) => [rfq, ...prev]);
      toast.success(`${rfq.rfqNumber} sent`);
      setCreateOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to create RFQ');
    } finally {
      setCreating(false);
    }
  };

  const openDetail = (rfq: RFQ) => {
    setSelected(rfq);
    setQuoteSupplierId('');
    setQuoteLines(rfq.items.map((i) => ({ partId: i.partId, name: i.name, quantity: i.quantity, unitCost: 0 })));
    setLoadingQuotes(true);
    api
      .get<{ quotations: SupplierQuotation[] }>(`/supplier-quotations?rfqId=${rfq.id}`)
      .then(({ quotations }) => setQuotations(quotations))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load quotations'))
      .finally(() => setLoadingQuotes(false));
  };

  const respondedSupplierIds = new Set(quotations.map((q) => q.supplierId));
  const availableSuppliers = selected ? selected.supplierIds.filter((id) => !respondedSupplierIds.has(id)) : [];

  const updateQuoteLine = (i: number, patch: Partial<SupplierQuotationLine>) => setQuoteLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const saveQuote = async () => {
    if (!selected || !quoteSupplierId || quoteLines.some((l) => !l.name.trim() || l.quantity <= 0 || l.unitCost < 0)) {
      toast.error('Select a supplier and enter a valid cost for every item');
      return;
    }
    setSavingQuote(true);
    try {
      const { quotation } = await api.post<{ quotation: SupplierQuotation }>('/supplier-quotations', {
        rfqId: selected.id,
        supplierId: quoteSupplierId,
        items: quoteLines,
      });
      setQuotations((prev) => [quotation, ...prev]);
      toast.success('Quotation recorded');
      setQuoteSupplierId('');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to record quotation');
    } finally {
      setSavingQuote(false);
    }
  };

  const selectQuotation = async (q: SupplierQuotation) => {
    setSelectingId(q.id);
    try {
      const { purchaseOrder } = await api.post<{ purchaseOrder: PurchaseOrder }>(`/supplier-quotations/${q.id}/select`);
      toast.success(`${purchaseOrder.poNumber} created from ${q.supplierName}'s quotation`);
      setSelected(null);
      loadRfqs();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to select quotation');
    } finally {
      setSelectingId(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="RFQs"
        description="Request quotes from suppliers, then pick a winner to create a Purchase Order."
        action={<Button onClick={openCreate}><PlusIcon className="h-4 w-4" /> New RFQ</Button>} />


      {loading ?
      <Card><div className="p-5"><TableSkeleton rows={6} /></div></Card> :
      rfqs.length === 0 ?
      <Card><EmptyState icon={SendIcon} title="No RFQs yet" description="Send a request for quotes to one or more suppliers to compare pricing." /></Card> :

      <Card>
          <ul className="divide-y divide-border-soft dark:divide-slate-800">
            {rfqs.map((r) =>
          <li key={r.id} className="flex cursor-pointer items-center justify-between gap-4 p-4 hover:bg-soft-gray dark:hover:bg-slate-800/60" onClick={() => openDetail(r)}>
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 font-bold text-navy dark:text-slate-100">
                    {r.rfqNumber}
                    <Badge tone={r.status === 'Open' ? 'amber' : 'gray'}>{r.status}</Badge>
                  </p>
                  <p className="truncate text-xs text-text-gray dark:text-slate-400">
                    {r.items.map((i) => i.name).join(', ')} · sent to {r.supplierNames?.join(', ') ?? `${r.supplierIds.length} suppliers`}
                  </p>
                </div>
                <p className="shrink-0 text-xs text-text-gray dark:text-slate-400">{formatDate(r.createdAt)}</p>
              </li>
          )}
          </ul>
        </Card>
      }

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New RFQ"
        size="lg"
        footer={
        <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button form="rfq-create-form" type="submit" loading={creating}>Send RFQ</Button>
          </>
        }>
        <form id="rfq-create-form" onSubmit={createRfq} className="space-y-4">
          <div className="space-y-2">
            <Label>Items</Label>
            {createLines.map((line, i) =>
            <div key={i} className="grid grid-cols-12 items-center gap-2">
                <input
                list="rfq-part-options"
                placeholder="Item name"
                value={line.name}
                onChange={(e) => updateCreateLine(i, { name: e.target.value })}
                className="col-span-8 h-10 rounded-lg border border-border-soft bg-white px-3 text-sm text-navy dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />

                <Input type="number" min={1} placeholder="Qty" value={line.quantity || ''} onChange={(e) => updateCreateLine(i, { quantity: Number(e.target.value) })} className="col-span-3" />
                <button type="button" onClick={() => removeCreateLine(i)} className="col-span-1 flex items-center justify-center text-red-500 hover:text-red-600"><TrashIcon className="h-4 w-4" /></button>
              </div>
            )}
            <datalist id="rfq-part-options">
              {parts.map((p) => <option key={p.id} value={p.name} />)}
            </datalist>
            <Button type="button" variant="secondary" size="sm" onClick={addCreateLine}><PlusIcon className="h-3.5 w-3.5" /> Add item</Button>
          </div>
          <div>
            <Label>Suppliers</Label>
            {suppliers.length === 0 ?
            <p className="text-xs text-text-gray dark:text-slate-400">Add a supplier first.</p> :

            <div className="space-y-1.5">
                {suppliers.map((s) =>
              <label key={s.id} className="flex items-center gap-2 text-sm text-navy dark:text-slate-200">
                    <input type="checkbox" checked={createSupplierIds.includes(s.id)} onChange={() => toggleCreateSupplier(s.id)} className="h-4 w-4 rounded border-border-soft text-teal focus:ring-teal dark:border-slate-700" />
                    {s.name}
                  </label>
              )}
              </div>
            }
          </div>
          <div>
            <Label htmlFor="rfq-due">Quotes due by (optional)</Label>
            <Input id="rfq-due" type="date" value={createDueDate} onChange={(e) => setCreateDueDate(e.target.value)} />
          </div>
        </form>
      </Modal>

      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected?.rfqNumber ?? 'RFQ'} size="xl">
        {selected &&
        <div className="space-y-6">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Items requested</p>
              <ul className="space-y-1 text-sm text-navy dark:text-slate-200">
                {selected.items.map((i) => <li key={i.name}>{i.name} × {i.quantity}</li>)}
              </ul>
            </div>

            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Quotations</p>
              {loadingQuotes ?
            <p className="text-sm text-text-gray dark:text-slate-400">Loading…</p> :
            quotations.length === 0 ?
            <p className="text-sm text-text-gray dark:text-slate-400">No quotations recorded yet.</p> :

            <div className="space-y-2">
                  {quotations.map((q) =>
                <div key={q.id} className="flex items-center justify-between gap-3 rounded-xl border border-border-soft p-3 dark:border-slate-800">
                      <div>
                        <p className="flex items-center gap-1.5 font-semibold text-navy dark:text-slate-100">
                          {q.supplierName}
                          <Badge tone={q.status === 'Selected' ? 'green' : q.status === 'Rejected' ? 'red' : 'amber'}>{q.status}</Badge>
                        </p>
                        <p className="text-xs text-text-gray dark:text-slate-400">{q.items.map((i) => `${i.name} × ${i.quantity} @ ${formatCurrency(i.unitCost)}`).join(', ')}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <p className="font-bold text-navy dark:text-slate-100">{formatCurrency(q.total)}</p>
                        {selected.status === 'Open' && q.status === 'Submitted' &&
                    <Button size="sm" onClick={() => selectQuotation(q)} loading={selectingId === q.id}><CheckIcon className="h-3.5 w-3.5" /> Select</Button>
                    }
                      </div>
                    </div>
                )}
                </div>
            }
            </div>

            {selected.status === 'Open' && availableSuppliers.length > 0 &&
          <div className="space-y-3 border-t border-border-soft pt-4 dark:border-slate-800">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Record a quotation</p>
                <Select value={quoteSupplierId} onChange={(e) => setQuoteSupplierId(e.target.value)}>
                  <option value="">— select a supplier —</option>
                  {availableSuppliers.map((id) => {
                const supplier = suppliers.find((s) => s.id === id);
                return supplier ? <option key={id} value={id}>{supplier.name}</option> : null;
              })}
                </Select>
                {quoteLines.map((line, i) =>
            <div key={i} className="grid grid-cols-12 items-center gap-2">
                    <span className="col-span-6 text-sm text-navy dark:text-slate-200">{line.name} × {line.quantity}</span>
                    <Input
                type="number"
                min={0}
                placeholder="Unit cost"
                value={line.unitCost || ''}
                onChange={(e) => updateQuoteLine(i, { unitCost: Number(e.target.value) })}
                className="col-span-6" />

                  </div>
            )}
                <Button size="sm" onClick={saveQuote} loading={savingQuote} disabled={!quoteSupplierId}>Record quotation</Button>
              </div>
          }
          </div>
        }
      </Modal>
    </div>);

}

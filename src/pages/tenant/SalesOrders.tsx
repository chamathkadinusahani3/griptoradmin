import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FileTextIcon, PlusIcon, TrashIcon, PackageCheckIcon, XIcon, CheckIcon, PencilIcon, SearchIcon, DownloadIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { StatusBadge } from '../../components/StatusBadge';
import { SalesAttachmentsButton } from '../../components/SalesAttachments';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Label, Textarea } from '../../components/ui/Input';
import { SignaturePad } from '../../components/ui/SignaturePad';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { SalesOrder, SalesOrderStatus, SalesOrderDiscountType, SalesOrderPayType, SalesOrderVatType } from '../../types/salesOrder';
import { DeliveryNote } from '../../types/deliveryNote';
import { Customer } from '../../types/customer';
import { Part } from '../../types/part';
import { JobCard } from '../../types/jobCard';
import { Salesperson } from '../../types/salesperson';
import { Department } from '../../types/department';
import { PriceList } from '../../types/priceList';
import { CustomerStatement } from '../../types/statement';
import { Client } from '../../types/client';
import { formatCurrency, formatDate } from '../../lib/utils';
import { downloadDocumentPdf } from '../../lib/pdf';
import { api, ApiError } from '../../lib/api';
import { useHasPermission } from '../../context/AuthContext';

const STATUS_FILTERS: ('All' | SalesOrderStatus)[] = ['All', 'Pending Approval', 'Confirmed', 'Partially Fulfilled', 'Fulfilled', 'Cancelled'];
const CREDIT_PERIODS = ['Cash on Delivery', 'Net 7 Days', 'Net 15 Days', 'Net 30 Days', 'Net 60 Days'] as const;
const PAY_TYPES: SalesOrderPayType[] = ['Cash', 'Credit'];
const VAT_TYPES: SalesOrderVatType[] = ['Non Vat', 'Vat'];
const DELIVERY_TYPES = ['Normal', 'Express', 'Pickup'] as const;
// A Sales Order can only be edited before anything's been delivered —
// matches routes/sales-orders/[id].ts's own EDITABLE_STATUSES exactly.
const EDITABLE_STATUSES: SalesOrderStatus[] = ['Pending Approval', 'Confirmed'];

interface DraftLine {
  partId: string;
  isManualEntry: boolean;
  // Only used when isManualEntry is true — the catalog Part.name is used
  // otherwise.
  manualName: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  discount1Type: SalesOrderDiscountType;
  discount1Value: number;
  discount2Type: SalesOrderDiscountType;
  discount2Value: number;
}

const emptyHeaderForm = {
  customerId: '',
  jobCardId: '',
  salespersonId: '',
  departmentId: '',
  creditPeriod: CREDIT_PERIODS[0] as string,
  payType: 'Credit' as SalesOrderPayType,
  scheduledDeliveryDate: '',
  deliveryMarkingDate: '',
  deliveryType: DELIVERY_TYPES[0] as string,
  deliveryName: '',
  deliveryAddress: '',
  customerAddress: '',
  customerTel: '',
  vatType: 'Non Vat' as SalesOrderVatType,
  vatNumber: '',
  svatNumber: '',
  brand: '',
  notes: '',
  staffNote: '',
};

function lineTotal(l: DraftLine): number {
  const gross = (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0);
  const d1 = l.discount1Type === 'percent' ? (gross * (Number(l.discount1Value) || 0)) / 100 : Number(l.discount1Value) || 0;
  const d2 = l.discount2Type === 'percent' ? (gross * (Number(l.discount2Value) || 0)) / 100 : Number(l.discount2Value) || 0;
  return Math.max(0, gross - d1 - d2);
}

export function SalesOrders() {
  const canApprove = useHasPermission('approvals:respond');
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [jobCards, setJobCards] = useState<JobCard[]>([]);
  const [salespersons, setSalespersons] = useState<Salesperson[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'All' | SalesOrderStatus>('All');
  const [searchQuery, setSearchQuery] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyHeaderForm);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  const [rejectTarget, setRejectTarget] = useState<SalesOrder | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [reviewing, setReviewing] = useState(false);

  const [fulfillTarget, setFulfillTarget] = useState<SalesOrder | null>(null);
  const [fulfillQuantities, setFulfillQuantities] = useState<Record<string, string>>({});
  const [fulfilling, setFulfilling] = useState(false);
  const [receiverName, setReceiverName] = useState('');
  const [receiverPhone, setReceiverPhone] = useState('');
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);

  // Return ratio for whichever customer is currently selected in the
  // create/edit modal — same live-computed figure (dealerMetrics.ts's
  // computeDealerMetrics, via the customer's own statement endpoint) that
  // returnRatioGate.ts checks at invoice creation. Shown here purely as an
  // early heads-up while placing the order — the actual block/warn still
  // only fires later, at Customer Invoice creation.
  const [returnRatioThresholdPct, setReturnRatioThresholdPct] = useState(20);
  const [customerReturnRatio, setCustomerReturnRatio] = useState<number | null>(null);
  const [returnRatioLoading, setReturnRatioLoading] = useState(false);

  const loadOrders = () => {
    api
      .get<{ salesOrders: SalesOrder[] }>('/sales-orders')
      .then(({ salesOrders }) => setOrders(salesOrders))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load sales orders'))
      .finally(() => setLoading(false));
  };

  useEffect(loadOrders, []);
  useEffect(() => {
    api.get<{ customers: Customer[] }>('/customers').then(({ customers }) => setCustomers(customers)).catch(() => setCustomers([]));
    api.get<{ parts: Part[] }>('/parts').then(({ parts }) => setParts(parts)).catch(() => setParts([]));
    api.get<{ jobCards: JobCard[] }>('/job-cards').then(({ jobCards }) => setJobCards(jobCards)).catch(() => setJobCards([]));
    api.get<{ salespersons: Salesperson[] }>('/salespersons').then(({ salespersons }) => setSalespersons(salespersons)).catch(() => setSalespersons([]));
    api.get<{ departments: Department[] }>('/departments').then(({ departments }) => setDepartments(departments)).catch(() => setDepartments([]));
    // Silently empty when Price Lists are disabled or the caller lacks
    // price-lists:view — the resolver below just falls back to part.price.
    api.get<{ priceLists: PriceList[] }>('/price-lists').then(({ priceLists }) => setPriceLists(priceLists)).catch(() => setPriceLists([]));
    api.get<{ client: Client }>('/tenant/me').then(({ client }) => setReturnRatioThresholdPct(client.returnRatioThresholdPct)).catch(() => undefined);
  }, []);

  // Refetched every time the selected customer changes while the modal is
  // open — statement.ts only computes a return ratio for credit-eligible
  // types (corporate/wholesale/dealer), so it comes back undefined/null for
  // an individual/retail customer.
  useEffect(() => {
    if (!modalOpen || !form.customerId) {
      setCustomerReturnRatio(null);
      return;
    }
    setReturnRatioLoading(true);
    api
      .get<CustomerStatement>(`/customers/${form.customerId}/statement`)
      .then((statement) => setCustomerReturnRatio(statement.returnRatioPct ?? null))
      .catch(() => setCustomerReturnRatio(null))
      .finally(() => setReturnRatioLoading(false));
  }, [modalOpen, form.customerId]);

  // Mirrors api/_lib/priceListResolver.ts: the selected customer's assigned
  // price list overrides a part's catalog price when one exists, otherwise
  // falls through unchanged.
  const resolvePrice = (customerId: string, part: Part): number => {
    const customer = customers.find((c) => c.id === customerId);
    if (!customer?.defaultPriceListId) return part.price;
    const priceList = priceLists.find((pl) => pl.id === customer.defaultPriceListId);
    const override = priceList?.overrides.find((o) => o.partId === part.id);
    return override?.price ?? part.price;
  };

  // A part catalog isn't required to place an order any more — a manually
  // entered line covers that case — only a customer to bill is mandatory.
  const noPrereqs = customers.length === 0;

  const openCreate = () => {
    setEditingOrderId(null);
    const firstCustomer = customers[0];
    setForm({
      ...emptyHeaderForm,
      customerId: firstCustomer?.id ?? '',
      customerAddress: firstCustomer?.billingAddress ?? '',
      customerTel: firstCustomer?.phone ?? '',
      vatNumber: firstCustomer?.taxNumber ?? '',
    });
    setLines([]);
    setModalOpen(true);
  };

  // Only offered for statuses the backend's own EDITABLE_STATUSES accepts —
  // matches routes/sales-orders/[id].ts's handleEdit guard exactly, so a
  // stale button never has to round-trip a 400 to discover it's blocked.
  const openEdit = (order: SalesOrder) => {
    setEditingOrderId(order.id);
    setForm({
      customerId: order.customerId,
      jobCardId: order.jobCardId ?? '',
      salespersonId: order.salespersonId ?? '',
      departmentId: order.departmentId ?? '',
      creditPeriod: order.creditPeriod ?? CREDIT_PERIODS[0],
      payType: order.payType,
      scheduledDeliveryDate: order.scheduledDeliveryDate ? order.scheduledDeliveryDate.slice(0, 10) : '',
      deliveryMarkingDate: order.deliveryMarkingDate ? order.deliveryMarkingDate.slice(0, 10) : '',
      deliveryType: order.deliveryType || DELIVERY_TYPES[0],
      deliveryName: order.deliveryName ?? '',
      deliveryAddress: order.deliveryAddress ?? '',
      customerAddress: order.customerAddress ?? '',
      customerTel: order.customerTel ?? '',
      vatType: order.vatType,
      vatNumber: order.vatNumber ?? '',
      svatNumber: order.svatNumber ?? '',
      brand: order.brand ?? '',
      notes: order.notes ?? '',
      staffNote: order.staffNote ?? '',
    });
    setLines(
      order.items.map((l) => ({
        partId: l.isManualEntry ? '' : l.partId,
        isManualEntry: l.isManualEntry,
        manualName: l.isManualEntry ? l.name : '',
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        unitCost: l.unitCost,
        discount1Type: l.discount1Type,
        discount1Value: l.discount1Value,
        discount2Type: l.discount2Type,
        discount2Value: l.discount2Value,
      }))
    );
    setModalOpen(true);
  };

  const addLine = () => {
    const firstAvailable = parts[0];
    if (!firstAvailable) return;
    setLines((prev) => [
      ...prev,
      { partId: firstAvailable.id, isManualEntry: false, manualName: '', quantity: 1, unitPrice: resolvePrice(form.customerId, firstAvailable), unitCost: firstAvailable.cost, discount1Type: 'amount', discount1Value: 0, discount2Type: 'amount', discount2Value: 0 },
    ]);
  };
  const addManualLine = () => {
    setLines((prev) => [
      ...prev,
      { partId: '', isManualEntry: true, manualName: '', quantity: 1, unitPrice: 0, unitCost: 0, discount1Type: 'amount', discount1Value: 0, discount2Type: 'amount', discount2Value: 0 },
    ]);
  };
  const updateLine = (i: number, patch: Partial<DraftLine>) => setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const removeLine = (i: number) => setLines((prev) => prev.filter((_, idx) => idx !== i));

  const previewTotal = lines.reduce((sum, l) => sum + lineTotal(l), 0);

  const save = async () => {
    if (!form.customerId || lines.length === 0) {
      toast.error('A customer and at least one line item are required');
      return;
    }
    if (lines.some((l) => l.isManualEntry && !l.manualName.trim())) {
      toast.error('Every manually-entered line needs a name');
      return;
    }
    setSaving(true);
    try {
      const items = lines.map((l) =>
        l.isManualEntry ?
        {
          manual: true,
          name: l.manualName.trim(),
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          unitCost: l.unitCost,
          discount1Type: l.discount1Type,
          discount1Value: l.discount1Value,
          discount2Type: l.discount2Type,
          discount2Value: l.discount2Value,
        } :
        {
          description: l.partId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discount1Type: l.discount1Type,
          discount1Value: l.discount1Value,
          discount2Type: l.discount2Type,
          discount2Value: l.discount2Value,
        }
      );
      // customerId is intentionally omitted from the edit body — the
      // backend's handleEdit never reads it, an order's customer can't be
      // changed after creation (see routes/sales-orders/[id].ts's comment).
      const sharedBody = {
        jobCardId: form.jobCardId || undefined,
        salespersonId: form.salespersonId || undefined,
        departmentId: form.departmentId || undefined,
        creditPeriod: form.creditPeriod || undefined,
        payType: form.payType,
        scheduledDeliveryDate: form.scheduledDeliveryDate || undefined,
        deliveryMarkingDate: form.deliveryMarkingDate || undefined,
        deliveryType: form.deliveryType || undefined,
        deliveryName: form.deliveryName || undefined,
        deliveryAddress: form.deliveryAddress || undefined,
        customerAddress: form.customerAddress || undefined,
        customerTel: form.customerTel || undefined,
        vatType: form.vatType,
        vatNumber: form.vatNumber || undefined,
        svatNumber: form.svatNumber || undefined,
        brand: form.brand || undefined,
        notes: form.notes || undefined,
        staffNote: form.staffNote || undefined,
        items,
      };
      const response = editingOrderId ?
      await api.patch<{
        salesOrder: SalesOrder;
        creditWarning?: string;
        discountWarning?: string;
        appliedPromotions?: { lineName: string; promotionName: string }[];
      }>(`/sales-orders/${editingOrderId}`, sharedBody) :
      await api.post<{
        salesOrder: SalesOrder;
        creditWarning?: string;
        discountWarning?: string;
        appliedPromotions?: { lineName: string; promotionName: string }[];
      }>('/sales-orders', { ...sharedBody, customerId: form.customerId });
      const { salesOrder, creditWarning, discountWarning, appliedPromotions } = response;
      setOrders((prev) => editingOrderId ? prev.map((o) => (o.id === salesOrder.id ? salesOrder : o)) : [salesOrder, ...prev]);
      toast.success(editingOrderId ? `${salesOrder.salesOrderNumber} updated` : `${salesOrder.salesOrderNumber} created`);
      if (creditWarning) toast.warning(creditWarning);
      if (discountWarning) toast.warning(discountWarning);
      if (appliedPromotions?.length) {
        toast.info(appliedPromotions.map((p) => `"${p.promotionName}" applied to ${p.lineName}`).join('; '));
      }
      setModalOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : `Failed to ${editingOrderId ? 'update' : 'create'} sales order`);
    } finally {
      setSaving(false);
    }
  };

  const cancel = async (order: SalesOrder) => {
    setActingId(order.id);
    try {
      const { salesOrder } = await api.patch<{ salesOrder: SalesOrder }>(`/sales-orders/${order.id}`, { action: 'cancel' });
      setOrders((prev) => prev.map((o) => (o.id === salesOrder.id ? salesOrder : o)));
      toast.success(`${salesOrder.salesOrderNumber} cancelled`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to cancel sales order');
    } finally {
      setActingId(null);
    }
  };

  const approve = async (order: SalesOrder) => {
    setReviewing(true);
    try {
      const { salesOrder } = await api.patch<{ salesOrder: SalesOrder }>(`/sales-orders/${order.id}`, { action: 'approve' });
      setOrders((prev) => prev.map((o) => (o.id === salesOrder.id ? salesOrder : o)));
      toast.success(`${salesOrder.salesOrderNumber} approved`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to approve sales order');
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
      const { salesOrder } = await api.patch<{ salesOrder: SalesOrder }>(`/sales-orders/${rejectTarget.id}`, {
        action: 'reject',
        rejectionReason,
      });
      setOrders((prev) => prev.map((o) => (o.id === salesOrder.id ? salesOrder : o)));
      toast.success(`${salesOrder.salesOrderNumber} rejected`);
      setRejectTarget(null);
      setRejectionReason('');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to reject sales order');
    } finally {
      setReviewing(false);
    }
  };

  const openFulfill = (order: SalesOrder) => {
    setFulfillTarget(order);
    setFulfillQuantities(
      Object.fromEntries(
        order.items.filter((l) => l.deliveredQuantity < l.quantity).map((l) => [l.partId, String(l.quantity - l.deliveredQuantity)])
      )
    );
    setReceiverName('');
    setReceiverPhone('');
    setSignatureDataUrl(null);
    setPhotoDataUrl(null);
  };

  const handleFulfillPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_500_000) {
      toast.error('Photo is too large — please pick a smaller image');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPhotoDataUrl(typeof reader.result === 'string' ? reader.result : null);
    reader.readAsDataURL(file);
  };

  const submitFulfill = async () => {
    if (!fulfillTarget) return;
    const items = Object.entries(fulfillQuantities)
      .filter(([, v]) => v.trim() !== '' && Number(v) > 0)
      .map(([partId, v]) => ({ partId, quantity: Number(v) }));
    if (items.length === 0) {
      toast.error('Enter a quantity for at least one line');
      return;
    }
    setFulfilling(true);
    try {
      const { salesOrder, deliveryNote } = await api.post<{ salesOrder: SalesOrder; deliveryNote?: DeliveryNote }>(`/sales-orders/${fulfillTarget.id}/fulfill`, {
        items,
        receiverName: receiverName.trim() || undefined,
        receiverPhone: receiverPhone.trim() || undefined,
        signatureDataUrl: signatureDataUrl || undefined,
        photoDataUrl: photoDataUrl || undefined,
      });
      setOrders((prev) => prev.map((o) => (o.id === salesOrder.id ? salesOrder : o)));
      if (deliveryNote?.status === 'Pending') {
        toast.success(`${deliveryNote.deliveryNoteNumber} prepared — confirm it from Delivery Notes to actually move stock`);
        if (receiverName || receiverPhone || signatureDataUrl || photoDataUrl) {
          toast.info('This delivery still needs confirming — capture proof of delivery again from Delivery Notes; it wasn\'t saved yet.');
        }
      } else {
        toast.success(`${salesOrder.salesOrderNumber} — stock updated (${salesOrder.status})`);
      }
      setFulfillTarget(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to fulfill sales order');
    } finally {
      setFulfilling(false);
    }
  };

  const printOrder = (order: SalesOrder) => {
    downloadDocumentPdf({
      title: 'Sales Order',
      number: order.salesOrderNumber,
      date: order.createdAt,
      customerName: order.customerName,
      items: order.items.map((l) => ({ description: l.name, quantity: l.quantity, unitPrice: l.unitPrice })),
      subtotal: order.subtotal,
      discountPct: order.discountPct,
      discountAmount: order.discountAmount,
      taxAmount: order.taxAmount,
      total: order.total,
      extraLines: [
        { label: 'Pay Type', value: order.payType },
        { label: 'VAT Type', value: order.vatType },
        ...(order.vatNumber ? [{ label: 'VAT No', value: order.vatNumber }] : []),
        ...(order.svatNumber ? [{ label: 'SVAT No', value: order.svatNumber }] : []),
        ...(order.brand ? [{ label: 'Brand', value: order.brand }] : []),
      ],
      notes: order.notes,
      kind: 'sales',
    });
  };

  const query = searchQuery.trim().toLowerCase();
  const filtered = orders.filter(
    (o) =>
    (statusFilter === 'All' || o.status === statusFilter) &&
    (!query || o.salesOrderNumber.toLowerCase().includes(query) || (o.customerName ?? '').toLowerCase().includes(query))
  );

  return (
    <div>
      <PageHeader
        title="Sales Orders"
        description="Confirm a parts order now, deliver it (in full or in part) later."
        action={
        <Button onClick={openCreate} disabled={noPrereqs} title={noPrereqs ? 'Add a customer first' : undefined}>
            <PlusIcon className="h-4 w-4" /> New sales order
          </Button>
        } />


      <div className="mb-4 flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((s) =>
        <button
          key={s}
          onClick={() => setStatusFilter(s)}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${statusFilter === s ? 'bg-griptor-gradient text-white' : 'bg-soft-gray text-text-gray hover:bg-light-blue dark:bg-slate-800 dark:text-slate-300'}`}>

            {s}
          </button>
        )}
        <div className="ml-auto w-full max-w-xs">
          <Input
            icon={SearchIcon}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Find by ref no or customer..." />

        </div>
      </div>

      {loading ?
      <Card><div className="space-y-3 p-5">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div></Card> :
      filtered.length === 0 ?
      <Card><EmptyState icon={FileTextIcon} title="No sales orders" description="Confirm a parts order for a customer to fulfill later." /></Card> :

      <Card>
          <ul className="divide-y divide-border-soft dark:divide-slate-800">
            {filtered.map((o) =>
          <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 border-l-4 border-l-blue-500 p-4 dark:border-l-blue-400">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-navy dark:text-slate-100">{o.salesOrderNumber}</p>
                    <StatusBadge status={o.status} />
                  </div>
                  <p className="mt-1 text-xs text-text-gray dark:text-slate-400">{o.customerName} · {o.items.length} item{o.items.length === 1 ? '' : 's'}</p>
                  <p className="mt-1 text-xs text-text-gray dark:text-slate-400">{formatDate(o.createdAt)}</p>
                  {o.status === 'Cancelled' && o.rejectionReason && <p className="mt-1 text-xs text-text-gray dark:text-slate-400">Rejected: {o.rejectionReason}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="teal">{formatCurrency(o.total)}</Badge>
                  <SalesAttachmentsButton
                    docType="sales-orders"
                    basePath={`/sales-orders/${o.id}/attachments`}
                    attachments={o.attachments}
                    onChange={(next) => setOrders((prev) => prev.map((x) => (x.id === o.id ? { ...x, attachments: next } : x)))} />
                  <Button size="sm" variant="ghost" onClick={() => printOrder(o)}><DownloadIcon className="h-3.5 w-3.5" /> Print</Button>
                  {EDITABLE_STATUSES.includes(o.status) &&
              <Button size="sm" variant="ghost" onClick={() => openEdit(o)}><PencilIcon className="h-3.5 w-3.5" /> Edit</Button>
              }
                  {o.status === 'Pending Approval' && canApprove &&
              <>
                      <Button size="sm" variant="secondary" loading={reviewing} onClick={() => approve(o)}><CheckIcon className="h-3.5 w-3.5" /> Approve</Button>
                      <Button size="sm" variant="ghost" onClick={() => { setRejectTarget(o); setRejectionReason(''); }}><XIcon className="h-3.5 w-3.5" /> Reject</Button>
                    </>
              }
                  {(o.status === 'Confirmed' || o.status === 'Partially Fulfilled') &&
              <>
                      <Button size="sm" onClick={() => openFulfill(o)}>
                        <PackageCheckIcon className="h-3.5 w-3.5" /> Deliver
                      </Button>
                      {o.status === 'Confirmed' &&
                <Button size="sm" variant="ghost" loading={actingId === o.id} onClick={() => cancel(o)}><XIcon className="h-3.5 w-3.5" /> Cancel</Button>
                }
                    </>
              }
                </div>
              </li>
          )}
          </ul>
        </Card>
      }

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingOrderId ? 'Edit sales order' : 'New sales order'}
        size="xl"
        footer={
        <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={save} loading={saving}>{editingOrderId ? 'Save changes' : 'Create sales order'}</Button>
          </>
        }>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="so-customer">Customer</Label>
            <Select
              id="so-customer"
              value={form.customerId}
              disabled={!!editingOrderId}
              title={editingOrderId ? 'The customer on an existing order cannot be changed' : undefined}
              onChange={(e) => {
                const nextCustomer = customers.find((c) => c.id === e.target.value);
                setForm((f) => ({
                  ...f,
                  customerId: e.target.value,
                  customerAddress: nextCustomer?.billingAddress ?? '',
                  customerTel: nextCustomer?.phone ?? '',
                  vatNumber: nextCustomer?.taxNumber ?? '',
                }));
              }}>

              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            {form.customerId &&
            <p className="mt-1 text-xs">
                {returnRatioLoading ?
              <span className="text-text-gray dark:text-slate-400">Loading return ratio…</span> :
              customerReturnRatio === null ?
              <span className="text-text-gray dark:text-slate-400">Return ratio: no history yet</span> :

              <span className={customerReturnRatio > returnRatioThresholdPct ? 'font-semibold text-red-500' : 'text-text-gray dark:text-slate-400'}>
                    Return ratio: {customerReturnRatio}%{customerReturnRatio > returnRatioThresholdPct ? ` (exceeds this tenant's ${returnRatioThresholdPct}% threshold)` : ''}
                  </span>
              }
              </p>
            }
          </div>
          <div>
            <Label htmlFor="so-jobcard">Job No (optional)</Label>
            <Select id="so-jobcard" value={form.jobCardId} onChange={(e) => setForm((f) => ({ ...f, jobCardId: e.target.value }))}>
              <option value="">— none —</option>
              {jobCards.map((j) => <option key={j.id} value={j.id}>{j.id} — {j.vehicle}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="so-salesperson">Sales Ex (optional)</Label>
            <Select id="so-salesperson" value={form.salespersonId} onChange={(e) => setForm((f) => ({ ...f, salespersonId: e.target.value }))}>
              <option value="">— auto-assign from customer —</option>
              {salespersons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="so-department">Department (optional)</Label>
            <Select id="so-department" value={form.departmentId} onChange={(e) => setForm((f) => ({ ...f, departmentId: e.target.value }))}>
              <option value="">— none —</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="so-pay-type">Pay Type</Label>
            <Select id="so-pay-type" value={form.payType} onChange={(e) => setForm((f) => ({ ...f, payType: e.target.value as SalesOrderPayType }))}>
              {PAY_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="so-credit-period">Credit Period</Label>
            <Select id="so-credit-period" value={form.creditPeriod} onChange={(e) => setForm((f) => ({ ...f, creditPeriod: e.target.value }))}>
              {CREDIT_PERIODS.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="so-schedule-date">Schedule Delivery Date (optional)</Label>
            <Input id="so-schedule-date" type="date" value={form.scheduledDeliveryDate} onChange={(e) => setForm((f) => ({ ...f, scheduledDeliveryDate: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="so-delivery-marking-date">Delivery Marking Date (optional)</Label>
            <Input id="so-delivery-marking-date" type="date" value={form.deliveryMarkingDate} onChange={(e) => setForm((f) => ({ ...f, deliveryMarkingDate: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="so-delivery-type">Delivery Type</Label>
            <Select id="so-delivery-type" value={form.deliveryType} onChange={(e) => setForm((f) => ({ ...f, deliveryType: e.target.value }))}>
              {DELIVERY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="so-delivery-name">Delivery Name (optional)</Label>
            <Input id="so-delivery-name" value={form.deliveryName} onChange={(e) => setForm((f) => ({ ...f, deliveryName: e.target.value }))} placeholder="Defaults to the customer" />
          </div>
          <div>
            <Label htmlFor="so-delivery-address">Delivery Address (optional)</Label>
            <Input id="so-delivery-address" value={form.deliveryAddress} onChange={(e) => setForm((f) => ({ ...f, deliveryAddress: e.target.value }))} placeholder="Defaults to the customer" />
          </div>
          <div>
            <Label htmlFor="so-address">Address (optional)</Label>
            <Input id="so-address" value={form.customerAddress} onChange={(e) => setForm((f) => ({ ...f, customerAddress: e.target.value }))} placeholder="Auto-filled from the customer" />
          </div>
          <div>
            <Label htmlFor="so-tel">Tel (optional)</Label>
            <Input id="so-tel" value={form.customerTel} onChange={(e) => setForm((f) => ({ ...f, customerTel: e.target.value }))} placeholder="Auto-filled from the customer" />
          </div>
          <div>
            <Label htmlFor="so-vat-type">VAT Type</Label>
            <Select id="so-vat-type" value={form.vatType} onChange={(e) => setForm((f) => ({ ...f, vatType: e.target.value as SalesOrderVatType }))}>
              {VAT_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="so-vat-no">VAT No (optional)</Label>
            <Input id="so-vat-no" value={form.vatNumber} onChange={(e) => setForm((f) => ({ ...f, vatNumber: e.target.value }))} placeholder="Auto-filled from the customer" disabled={form.vatType === 'Non Vat'} />
          </div>
          <div>
            <Label htmlFor="so-svat-no">SVAT No (optional)</Label>
            <Input id="so-svat-no" value={form.svatNumber} onChange={(e) => setForm((f) => ({ ...f, svatNumber: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="so-brand">Brand (optional)</Label>
            <Input id="so-brand" value={form.brand} onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))} />
          </div>
        </div>

        <div className="mt-4">
          <Label>Line items</Label>
          <div className="overflow-x-auto rounded-xl border border-border-soft dark:border-slate-800">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-border-soft bg-soft-gray text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800 dark:bg-slate-800/50">
                  <th className="px-3 py-2 font-bold">Part</th>
                  <th className="px-3 py-2 font-bold">Stock</th>
                  <th className="px-3 py-2 font-bold">Qty</th>
                  <th className="px-3 py-2 font-bold">Cost</th>
                  <th className="px-3 py-2 font-bold">Price</th>
                  <th className="px-3 py-2 font-bold">Dis1</th>
                  <th className="px-3 py-2 font-bold">Dis2</th>
                  <th className="px-3 py-2 text-right font-bold">Total</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const part = l.isManualEntry ? undefined : parts.find((p) => p.id === l.partId);
                  return (
                    <tr key={i} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                      <td className="min-w-[180px] px-3 py-2">
                        {l.isManualEntry ?
                        <Input value={l.manualName} onChange={(e) => updateLine(i, { manualName: e.target.value })} placeholder="Item name" /> :

                        <Select
                          value={l.partId}
                          onChange={(e) => {
                            const nextPart = parts.find((p) => p.id === e.target.value);
                            updateLine(i, { partId: e.target.value, unitPrice: nextPart ? resolvePrice(form.customerId, nextPart) : l.unitPrice, unitCost: nextPart?.cost ?? l.unitCost });
                          }}>

                          {parts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </Select>
                        }
                      </td>
                      <td className="px-3 py-2 text-xs text-text-gray dark:text-slate-400">{part?.stock ?? '—'}</td>
                      <td className="min-w-[70px] px-3 py-2">
                        <Input type="number" min={1} value={l.quantity} onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })} />
                      </td>
                      <td className="min-w-[90px] px-3 py-2">
                        <Input type="number" min={0} value={l.unitCost} onChange={(e) => updateLine(i, { unitCost: Number(e.target.value) })} />
                      </td>
                      <td className="min-w-[90px] px-3 py-2">
                        <Input type="number" min={0} value={l.unitPrice} onChange={(e) => updateLine(i, { unitPrice: Number(e.target.value) })} />
                      </td>
                      <td className="min-w-[130px] px-3 py-2">
                        <div className="flex gap-1">
                          <Input className="w-16" type="number" min={0} value={l.discount1Value} onChange={(e) => updateLine(i, { discount1Value: Number(e.target.value) })} />
                          <Select className="w-16" value={l.discount1Type} onChange={(e) => updateLine(i, { discount1Type: e.target.value as SalesOrderDiscountType })}>
                            <option value="amount">Rs</option>
                            <option value="percent">%</option>
                          </Select>
                        </div>
                      </td>
                      <td className="min-w-[130px] px-3 py-2">
                        <div className="flex gap-1">
                          <Input className="w-16" type="number" min={0} value={l.discount2Value} onChange={(e) => updateLine(i, { discount2Value: Number(e.target.value) })} />
                          <Select className="w-16" value={l.discount2Type} onChange={(e) => updateLine(i, { discount2Type: e.target.value as SalesOrderDiscountType })}>
                            <option value="amount">Rs</option>
                            <option value="percent">%</option>
                          </Select>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-navy dark:text-slate-100">{formatCurrency(lineTotal(l))}</td>
                      <td className="px-3 py-2">
                        <button type="button" onClick={() => removeLine(i)} className="flex items-center justify-center rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40">
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>);

                })}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex flex-wrap gap-4">
            <button type="button" onClick={addLine} disabled={parts.length === 0} className="flex items-center gap-1 text-xs font-semibold text-royal hover:underline disabled:opacity-50 dark:text-blue-300">
              <PlusIcon className="h-3.5 w-3.5" /> Add line
            </button>
            <button type="button" onClick={addManualLine} className="flex items-center gap-1 text-xs font-semibold text-royal hover:underline dark:text-blue-300">
              <PlusIcon className="h-3.5 w-3.5" /> Add manually entered line
            </button>
          </div>
          <p className="mt-2 text-right text-sm text-text-gray dark:text-slate-400">Sub Total: {formatCurrency(previewTotal)} (discount &amp; tax applied on save)</p>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="so-notes">Remark (optional)</Label>
            <Textarea id="so-notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="so-staff-note">Staff Note (optional)</Label>
            <Textarea id="so-staff-note" value={form.staffNote} onChange={(e) => setForm((f) => ({ ...f, staffNote: e.target.value }))} />
          </div>
        </div>
      </Modal>

      <Modal
        open={!!fulfillTarget}
        onClose={() => setFulfillTarget(null)}
        title={fulfillTarget ? `Deliver — ${fulfillTarget.salesOrderNumber}` : 'Deliver'}
        size="lg"
        footer={
        <>
            <Button variant="secondary" onClick={() => setFulfillTarget(null)}>Cancel</Button>
            <Button onClick={submitFulfill} loading={fulfilling}>Confirm delivery</Button>
          </>
        }>
        {fulfillTarget &&
        <div className="space-y-3">
            <p className="text-xs text-text-gray dark:text-slate-400">Enter how much of each line is going out now — leave a line at 0 to deliver it later.</p>
            {fulfillTarget.items.filter((l) => l.deliveredQuantity < l.quantity).map((l) => (
              <div key={l.partId} className="grid grid-cols-12 items-center gap-2">
                <span className="col-span-7 text-sm text-navy dark:text-slate-200">
                  {l.name}
                  <span className="ml-1.5 text-xs text-text-gray dark:text-slate-400">({l.quantity - l.deliveredQuantity} of {l.quantity} outstanding)</span>
                </span>
                <Input
                  type="number"
                  min={0}
                  max={l.quantity - l.deliveredQuantity}
                  className="col-span-5"
                  value={fulfillQuantities[l.partId] ?? ''}
                  onChange={(e) => setFulfillQuantities((prev) => ({ ...prev, [l.partId]: e.target.value }))} />

              </div>
            ))}

            <div className="border-t border-border-soft pt-3 dark:border-slate-800">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Proof of delivery (optional)</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="so-receiver-name">Receiver name</Label>
                  <Input id="so-receiver-name" value={receiverName} onChange={(e) => setReceiverName(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="so-receiver-phone">Receiver phone</Label>
                  <Input id="so-receiver-phone" value={receiverPhone} onChange={(e) => setReceiverPhone(e.target.value)} />
                </div>
              </div>
              <div className="mt-3">
                <Label>Signature</Label>
                <SignaturePad onChange={setSignatureDataUrl} />
              </div>
              <div className="mt-3">
                <Label htmlFor="so-photo">Photo</Label>
                <input id="so-photo" type="file" accept="image/*" capture="environment" onChange={handleFulfillPhotoChange} className="block w-full text-sm text-text-gray file:mr-3 file:rounded-lg file:border-0 file:bg-soft-gray file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-navy dark:text-slate-400 dark:file:bg-slate-800 dark:file:text-slate-100" />
                {photoDataUrl && <img src={photoDataUrl} alt="Delivery proof" className="mt-2 h-16 w-16 rounded-lg object-cover" />}
              </div>
            </div>
          </div>
        }
      </Modal>

      <Modal
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        title={rejectTarget ? `Reject ${rejectTarget.salesOrderNumber}` : 'Reject sales order'}
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
    </div>);

}

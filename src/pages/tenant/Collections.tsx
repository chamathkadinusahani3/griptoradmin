import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { HandCoinsIcon, PlusIcon, WalletIcon, BanknoteIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { StatCard } from '../../components/ui/StatCard';
import { Modal } from '../../components/ui/Modal';
import { Select, Label } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { CollectionModal } from './salespersons/CollectionModal';
import { CollectionRecord } from '../../types/collectionRecord';
import { Salesperson } from '../../types/salesperson';
import { Customer } from '../../types/customer';
import { formatCurrency, formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

const METHOD_TONE: Record<string, 'green' | 'blue' | 'purple' | 'amber' | 'gray'> = {
  Cash: 'green',
  Cheque: 'blue',
  Card: 'purple',
  'Bank Transfer': 'amber',
  Other: 'gray',
};

function isToday(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

export function Collections() {
  const [collections, setCollections] = useState<CollectionRecord[]>([]);
  const [salespersons, setSalespersons] = useState<Salesperson[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickedSalespersonId, setPickedSalespersonId] = useState('');
  const [pickedCustomerId, setPickedCustomerId] = useState('');

  const loadCollections = () => {
    setLoading(true);
    api
      .get<{ collections: CollectionRecord[] }>('/collections')
      .then(({ collections }) => setCollections(collections))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load collections'))
      .finally(() => setLoading(false));
  };

  useEffect(loadCollections, []);
  useEffect(() => {
    api.get<{ salespersons: Salesperson[] }>('/salespersons').then(({ salespersons }) => setSalespersons(salespersons)).catch(() => setSalespersons([]));
    api.get<{ customers: Customer[] }>('/customers').then(({ customers }) => setCustomers(customers)).catch(() => setCustomers([]));
  }, []);

  const summary = useMemo(() => {
    const todays = collections.filter((c) => isToday(c.date));
    const todaysTotal = todays.reduce((sum, c) => sum + c.amount, 0);
    const totalCash = collections.reduce((sum, c) => sum + (c.method === 'Cash' ? c.amount : 0), 0);
    const totalCheque = collections.reduce((sum, c) => sum + (c.method === 'Cheque' ? c.amount : 0), 0);
    return { todaysTotal, totalCash, totalCheque };
  }, [collections]);

  const pickedCustomer = customers.find((c) => c.id === pickedCustomerId);

  return (
    <div>
      <PageHeader
        title="Collections"
        description="Field cash/cheque collections recorded by salespersons — applied to a specific invoice or logged on account."
        action={<Button onClick={() => setPickerOpen(true)} disabled={salespersons.length === 0 || customers.length === 0}><PlusIcon className="h-4 w-4" /> Record collection</Button>} />


      {!loading && collections.length > 0 &&
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="Today's collections" value={formatCurrency(summary.todaysTotal)} icon={HandCoinsIcon} />
          <StatCard label="Total cash" value={formatCurrency(summary.totalCash)} icon={BanknoteIcon} />
          <StatCard label="Total cheque" value={formatCurrency(summary.totalCheque)} icon={WalletIcon} />
        </div>
      }

      {loading ?
      <Card><div className="p-5"><TableSkeleton rows={6} /></div></Card> :
      collections.length === 0 ?
      <Card><EmptyState icon={HandCoinsIcon} title="No collections yet" description="Collections recorded during field visits, or logged here directly, will show up in this history." /></Card> :

      <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                  <th className="px-5 py-3 font-bold">Date</th>
                  <th className="px-5 py-3 font-bold">Salesperson</th>
                  <th className="px-5 py-3 font-bold">Customer</th>
                  <th className="px-5 py-3 font-bold">Applied to</th>
                  <th className="px-5 py-3 font-bold">Method</th>
                  <th className="px-5 py-3 text-right font-bold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {collections.map((c) =>
              <tr key={c.id} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">{formatDate(c.date)}</td>
                    <td className="px-5 py-3 font-semibold text-navy dark:text-slate-100">{c.salespersonName ?? c.salespersonId}</td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">{c.customerName ?? c.customerId}</td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">{c.invoiceNumber ?? 'On account'}</td>
                    <td className="px-5 py-3">
                      <Badge tone={METHOD_TONE[c.method]}>{c.method}</Badge>
                      {c.chequeNumber && <span className="ml-1 text-xs text-text-gray dark:text-slate-500">#{c.chequeNumber}</span>}
                    </td>
                    <td className="px-5 py-3 text-right font-bold text-navy dark:text-slate-100">{formatCurrency(c.amount)}</td>
                  </tr>
              )}
              </tbody>
            </table>
          </div>
        </Card>
      }

      <Modal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Record collection"
        footer={
        <>
            <Button variant="secondary" onClick={() => setPickerOpen(false)}>Cancel</Button>
            <Button disabled={!pickedSalespersonId || !pickedCustomerId} onClick={() => setPickerOpen(false)}>Continue</Button>
          </>
        }>
        <div className="space-y-4">
          <div>
            <Label htmlFor="pick-salesperson">Salesperson</Label>
            <Select id="pick-salesperson" value={pickedSalespersonId} onChange={(e) => setPickedSalespersonId(e.target.value)}>
              <option value="">— select —</option>
              {salespersons.map((sp) => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="pick-customer">Customer</Label>
            <Select id="pick-customer" value={pickedCustomerId} onChange={(e) => setPickedCustomerId(e.target.value)}>
              <option value="">— select —</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
        </div>
      </Modal>

      {!pickerOpen && pickedSalespersonId && pickedCustomerId &&
      <CollectionModal
        salespersonId={pickedSalespersonId}
        customerId={pickedCustomerId}
        customerName={pickedCustomer?.name}
        onClose={() => {
          setPickedSalespersonId('');
          setPickedCustomerId('');
        }}
        onRecorded={(c) => {
          setCollections((prev) => [c, ...prev]);
          setPickedSalespersonId('');
          setPickedCustomerId('');
        }} />

      }
    </div>);

}

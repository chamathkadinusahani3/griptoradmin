import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { TruckIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { DeliveryNote } from '../../types/deliveryNote';
import { formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

export function DeliveryNotes() {
  const [notes, setNotes] = useState<DeliveryNote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ deliveryNotes: DeliveryNote[] }>('/delivery-notes')
      .then(({ deliveryNotes }) => setNotes(deliveryNotes))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load delivery notes'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader title="Delivery Notes" description="Every handover of goods to a customer against a sales order — created automatically when you deliver one." />

      {loading ?
      <Card><div className="p-5"><TableSkeleton rows={6} /></div></Card> :
      notes.length === 0 ?
      <Card><EmptyState icon={TruckIcon} title="No deliveries yet" description="Fulfilling a sales order (in full or in part) will create a record here." /></Card> :

      <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead>
                <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                  <th className="px-5 py-3 font-bold">Delivery note</th>
                  <th className="px-5 py-3 font-bold">Sales order</th>
                  <th className="px-5 py-3 font-bold">Customer</th>
                  <th className="px-5 py-3 font-bold">Items delivered</th>
                  <th className="px-5 py-3 font-bold">Date</th>
                </tr>
              </thead>
              <tbody>
                {notes.map((n) =>
              <tr key={n.id} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                    <td className="px-5 py-3 font-bold text-navy dark:text-slate-100">{n.deliveryNoteNumber}</td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-300">{n.salesOrderNumber ?? '—'}</td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-300">{n.customerName ?? '—'}</td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">{n.items.map((i) => `${i.name} × ${i.quantityDelivered}`).join(', ')}</td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">{formatDate(n.createdAt)}</td>
                  </tr>
              )}
              </tbody>
            </table>
          </div>
        </Card>
      }
    </div>);

}

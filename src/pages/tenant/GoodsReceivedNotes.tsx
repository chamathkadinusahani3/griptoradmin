import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PackageCheckIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { GoodsReceivedNote } from '../../types/goodsReceivedNote';
import { formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

export function GoodsReceivedNotes() {
  const [grns, setGrns] = useState<GoodsReceivedNote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ grns: GoodsReceivedNote[] }>('/goods-received-notes')
      .then(({ grns }) => setGrns(grns))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load goods received notes'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader title="Goods Received" description="Every delivery actually checked in against a purchase order — created automatically when you receive stock." />

      {loading ?
      <Card><div className="p-5"><TableSkeleton rows={6} /></div></Card> :
      grns.length === 0 ?
      <Card><EmptyState icon={PackageCheckIcon} title="No deliveries received yet" description="Receiving a purchase order (in full or in part) will create a record here." /></Card> :

      <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead>
                <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                  <th className="px-5 py-3 font-bold">GRN</th>
                  <th className="px-5 py-3 font-bold">Purchase order</th>
                  <th className="px-5 py-3 font-bold">Supplier</th>
                  <th className="px-5 py-3 font-bold">Items received</th>
                  <th className="px-5 py-3 font-bold">Date</th>
                </tr>
              </thead>
              <tbody>
                {grns.map((g) =>
              <tr key={g.id} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                    <td className="px-5 py-3 font-bold text-navy dark:text-slate-100">{g.grnNumber}</td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-300">{g.poNumber ?? '—'}</td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-300">{g.supplierName ?? '—'}</td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">{g.items.map((i) => `${i.name} × ${i.quantityReceived}`).join(', ')}</td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">{formatDate(g.createdAt)}</td>
                  </tr>
              )}
              </tbody>
            </table>
          </div>
        </Card>
      }
    </div>);

}

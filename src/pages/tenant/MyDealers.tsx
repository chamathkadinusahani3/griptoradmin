import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { StoreIcon, UsersIcon, WalletIcon, AlertTriangleIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { StatCard } from '../../components/ui/StatCard';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { formatCurrency } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

interface MyDealer {
  customerId: string;
  name: string;
  type: string;
  status: 'Active' | 'Inactive' | 'Blocked';
  territory?: string;
  visitFrequency: string;
  priority: 'High' | 'Medium' | 'Low';
  creditLimit: number;
  totalOutstanding: number;
  creditUtilizationPct: number | null;
  isInViolation: boolean;
  daysPastCreditPeriod: number;
  returnRatioPct: number | null;
}

const PRIORITY_TONE: Record<string, 'red' | 'amber' | 'gray'> = { High: 'red', Medium: 'amber', Low: 'gray' };
const STATUS_TONE: Record<string, 'red' | 'gray' | 'green'> = { Blocked: 'red', Inactive: 'gray', Active: 'green' };

export function MyDealers() {
  const [salesperson, setSalesperson] = useState<{ id: string; name: string; code: string } | null | undefined>(undefined);
  const [dealers, setDealers] = useState<MyDealer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ salesperson: { id: string; name: string; code: string } | null; dealers: MyDealer[] }>('/salespersons/me/dealers')
      .then(({ salesperson, dealers }) => {
        setSalesperson(salesperson);
        setDealers(dealers);
      })
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load your dealers'))
      .finally(() => setLoading(false));
  }, []);

  const totalOutstanding = dealers.reduce((sum, d) => sum + d.totalOutstanding, 0);
  const inViolationCount = dealers.filter((d) => d.isInViolation).length;

  return (
    <div>
      <PageHeader title="My Dealers" description="The shops assigned to you — outstanding balance, credit limit, and credit-period standing at a glance." />

      {loading ?
      <Card><div className="space-y-3 p-5">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div></Card> :
      salesperson === null ?
      <Card><EmptyState icon={UsersIcon} title="No salesperson profile linked" description="Your login isn't linked to a Salesperson record yet — ask an admin to link your Employee profile under Salespersons." /></Card> :
      dealers.length === 0 ?
      <Card><EmptyState icon={StoreIcon} title="No dealers assigned yet" description="Once shops are assigned to you, they'll show up here." /></Card> :

      <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Assigned dealers" value={String(dealers.length)} icon={StoreIcon} />
            <StatCard label="Total outstanding" value={formatCurrency(totalOutstanding)} icon={WalletIcon} />
            <StatCard label="Past credit period" value={String(inViolationCount)} icon={AlertTriangleIcon} hint={inViolationCount > 0 ? 'dealers overdue' : undefined} />
          </div>

          <Card>
            <ul className="divide-y divide-border-soft dark:divide-slate-800">
              {dealers.map((d) =>
            <li key={d.customerId} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-navy dark:text-slate-100">{d.name}</p>
                      <Badge tone={STATUS_TONE[d.status]}>{d.status}</Badge>
                      <Badge tone={PRIORITY_TONE[d.priority]}>{d.priority} priority</Badge>
                      {d.isInViolation && <Badge tone="red">{d.daysPastCreditPeriod}d overdue</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-text-gray dark:text-slate-400">
                      {d.territory ? `${d.territory} · ` : ''}{d.visitFrequency} visits
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-right">
                    <div>
                      <p className="text-xs text-text-gray dark:text-slate-400">Outstanding</p>
                      <p className="font-bold text-navy dark:text-slate-100">{formatCurrency(d.totalOutstanding)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-text-gray dark:text-slate-400">Credit limit</p>
                      <p className="font-semibold text-navy dark:text-slate-100">{d.creditLimit > 0 ? formatCurrency(d.creditLimit) : '—'}</p>
                    </div>
                    {d.creditUtilizationPct != null &&
                <div>
                        <p className="text-xs text-text-gray dark:text-slate-400">Utilization</p>
                        <p className={`font-semibold ${d.creditUtilizationPct >= 100 ? 'text-red-500' : 'text-navy dark:text-slate-100'}`}>{d.creditUtilizationPct}%</p>
                      </div>
                }
                    {d.returnRatioPct != null &&
                <div>
                        <p className="text-xs text-text-gray dark:text-slate-400">Return ratio</p>
                        <p className={`font-semibold ${d.returnRatioPct >= 20 ? 'text-red-500' : 'text-navy dark:text-slate-100'}`}>{d.returnRatioPct}%</p>
                      </div>
                }
                  </div>
                </li>
            )}
            </ul>
          </Card>
        </>
      }
    </div>);

}

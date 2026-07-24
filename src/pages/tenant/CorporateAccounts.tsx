import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { BuildingIcon, WalletIcon, AlertTriangleIcon, PackageIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { StatCard } from '../../components/ui/StatCard';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { CorporateAccount } from '../../types/corporateAccount';
import { Client } from '../../types/client';
import { formatCurrency } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

export function CorporateAccounts() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<CorporateAccount[]>([]);
  const [garage, setGarage] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const fleetEnabled = garage?.addOns.includes('gms-fleet') ?? false;

  useEffect(() => {
    api
      .get<{ client: Client }>('/tenant/me')
      .then(({ client }) => setGarage(client))
      .catch(() => setGarage(null));
    api
      .get<{ accounts: CorporateAccount[] }>('/customers/corporate-summary')
      .then(({ accounts }) => setAccounts(accounts))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load corporate accounts'))
      .finally(() => setLoading(false));
  }, []);

  const totalOutstanding = accounts.reduce((sum, a) => sum + a.totalOutstanding, 0);
  const totalOverdue = accounts.reduce((sum, a) => sum + a.overdueAmount, 0);

  return (
    <div>
      <PageHeader title="Corporate Accounts" description={`${accounts.length} corporate account${accounts.length === 1 ? '' : 's'}`} />

      {!loading && !fleetEnabled ? (
        <Card>
          <EmptyState
            icon={PackageIcon}
            title="Fleet Management add-on required"
            description="Corporate accounts (credit limits, discounts, statements) are part of the Fleet Management add-on. Enable it to start adding corporate customers."
          />
        </Card>
      ) : loading ? (
        <Card>
          <div className="p-5">
            <TableSkeleton rows={6} />
          </div>
        </Card>
      ) : accounts.length === 0 ? (
        <Card>
          <EmptyState
            icon={BuildingIcon}
            title="No corporate accounts yet"
            description="Mark a customer as Corporate from the Customers page to see it here."
          />
        </Card>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <StatCard label="Total outstanding" value={formatCurrency(totalOutstanding)} icon={WalletIcon} />
            <StatCard label="Total overdue" value={formatCurrency(totalOverdue)} icon={AlertTriangleIcon} />
          </div>

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                    <th className="px-5 py-3 font-bold">Account</th>
                    <th className="px-5 py-3 font-bold">Contact</th>
                    <th className="px-5 py-3 text-right font-bold">Discount</th>
                    <th className="px-5 py-3 text-right font-bold">Credit limit</th>
                    <th className="px-5 py-3 text-right font-bold">Outstanding</th>
                    <th className="px-5 py-3 text-right font-bold">Overdue</th>
                    <th className="px-5 py-3 font-bold">Credit usage</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((a) => {
                    const pctUsed = a.creditLimit > 0 ? Math.min(100, (a.totalOutstanding / a.creditLimit) * 100) : null;
                    const overLimit = a.creditLimit > 0 && a.totalOutstanding > a.creditLimit;
                    return (
                      <tr
                        key={a.id}
                        onClick={() => navigate(`/app/crm/customers?customer=${a.id}`)}
                        className="cursor-pointer border-b border-border-soft transition last:border-0 hover:bg-soft-gray dark:border-slate-800 dark:hover:bg-slate-800/50"
                      >
                        <td className="px-5 py-3">
                          <p className="font-bold text-navy dark:text-slate-100">{a.name}</p>
                          <p className="text-xs text-text-gray dark:text-slate-400">{a.email}</p>
                        </td>
                        <td className="px-5 py-3 text-text-gray dark:text-slate-400">{a.contactPerson || '—'}</td>
                        <td className="px-5 py-3 text-right">
                          {a.discountPct > 0 ? <Badge tone="green">{a.discountPct}%</Badge> : <span className="text-text-gray dark:text-slate-500">—</span>}
                        </td>
                        <td className="px-5 py-3 text-right font-semibold text-navy dark:text-slate-100">
                          {a.creditLimit > 0 ? formatCurrency(a.creditLimit) : '—'}
                        </td>
                        <td className="px-5 py-3 text-right font-semibold text-navy dark:text-slate-100">{formatCurrency(a.totalOutstanding)}</td>
                        <td className={`px-5 py-3 text-right font-semibold ${a.overdueAmount > 0 ? 'text-red-500' : 'text-navy dark:text-slate-100'}`}>
                          {formatCurrency(a.overdueAmount)}
                        </td>
                        <td className="px-5 py-3">
                          {pctUsed === null ? (
                            <span className="text-xs text-text-gray dark:text-slate-500">No limit set</span>
                          ) : (
                            <div className="w-32">
                              <div className="h-2 overflow-hidden rounded-full bg-soft-gray dark:bg-slate-800">
                                <div
                                  className={`h-full rounded-full ${overLimit ? 'bg-red-500' : 'bg-teal'}`}
                                  style={{ width: `${pctUsed}%` }}
                                />
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

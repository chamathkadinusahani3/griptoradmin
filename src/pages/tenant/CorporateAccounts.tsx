import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { BuildingIcon, WalletIcon, AlertTriangleIcon, PackageIcon, CheckCircle2Icon, XCircleIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { StatCard } from '../../components/ui/StatCard';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { CorporateAccount } from '../../types/corporateAccount';
import { Client } from '../../types/client';
import { SmsLog } from '../../types/messageTemplate';
import { formatCurrency, formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

function statusBadge(account: CorporateAccount) {
  if (account.avgDaysToPay === null && account.purchasesLast90Days === 0 && account.purchasesPrior90Days === 0 && account.totalOutstanding === 0) {
    return <Badge tone="gray">No history yet</Badge>;
  }
  return account.isInViolation ? <Badge tone="red">In violation</Badge> : <Badge tone="green">Good standing</Badge>;
}

export function CorporateAccounts() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'accounts' | 'report'>('accounts');
  const [accounts, setAccounts] = useState<CorporateAccount[]>([]);
  const [garage, setGarage] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportLogs, setReportLogs] = useState<SmsLog[]>([]);
  const [reportLogsLoading, setReportLogsLoading] = useState(false);
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

  useEffect(() => {
    if (tab !== 'report') return;
    setReportLogsLoading(true);
    api
      .get<{ logs: SmsLog[] }>('/sms/logs?source=dealer-outstanding-report&limit=100')
      .then(({ logs }) => setReportLogs(logs))
      .catch(() => setReportLogs([]))
      .finally(() => setReportLogsLoading(false));
  }, [tab]);

  const totalOutstanding = accounts.reduce((sum, a) => sum + a.totalOutstanding, 0);
  const totalOverdue = accounts.reduce((sum, a) => sum + a.overdueAmount, 0);
  const inViolation = accounts.filter((a) => a.isInViolation);

  return (
    <div>
      <PageHeader title="Corporate Accounts" description={`${accounts.length} corporate account${accounts.length === 1 ? '' : 's'}`} />

      {!loading && fleetEnabled && (
        <div className="mb-6 flex gap-2 border-b border-border-soft dark:border-slate-800">
          <button
            onClick={() => setTab('accounts')}
            className={`border-b-2 px-3 py-2 text-sm font-semibold transition ${tab === 'accounts' ? 'border-teal text-teal' : 'border-transparent text-text-gray hover:text-navy dark:text-slate-400 dark:hover:text-slate-100'}`}
          >
            Accounts
          </button>
          <button
            onClick={() => setTab('report')}
            className={`border-b-2 px-3 py-2 text-sm font-semibold transition ${tab === 'report' ? 'border-teal text-teal' : 'border-transparent text-text-gray hover:text-navy dark:text-slate-400 dark:hover:text-slate-100'}`}
          >
            Outstanding Report
          </button>
        </div>
      )}

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
      ) : tab === 'accounts' ? (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <StatCard label="Total outstanding" value={formatCurrency(totalOutstanding)} icon={WalletIcon} />
            <StatCard label="Total overdue" value={formatCurrency(totalOverdue)} icon={AlertTriangleIcon} />
          </div>

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                    <th className="px-5 py-3 font-bold">Account</th>
                    <th className="px-5 py-3 font-bold">Contact</th>
                    <th className="px-5 py-3 text-right font-bold">Discount</th>
                    <th className="px-5 py-3 text-right font-bold">Credit limit</th>
                    <th className="px-5 py-3 text-right font-bold">Outstanding</th>
                    <th className="px-5 py-3 text-right font-bold">Overdue</th>
                    <th className="px-5 py-3 font-bold">Credit usage</th>
                    <th className="px-5 py-3 text-right font-bold">Avg days to pay</th>
                    <th className="px-5 py-3 font-bold">Status</th>
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
                          {a.isInViolation && a.discountPct > 0 ? (
                            <Badge tone="red">Suspended</Badge>
                          ) : a.discountPct > 0 ? (
                            <Badge tone="green">{a.discountPct}%</Badge>
                          ) : (
                            <span className="text-text-gray dark:text-slate-500">—</span>
                          )}
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
                        <td className="px-5 py-3 text-right text-text-gray dark:text-slate-400">
                          {a.avgDaysToPay === null ? '—' : `${a.avgDaysToPay}d`}
                        </td>
                        <td className="px-5 py-3">{statusBadge(a)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <StatCard label="Dealers in violation" value={String(inViolation.length)} icon={AlertTriangleIcon} />
            <StatCard label="Total overdue" value={formatCurrency(totalOverdue)} icon={WalletIcon} />
          </div>

          <Card className="mb-6">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                    <th className="px-5 py-3 font-bold">Dealer</th>
                    <th className="px-5 py-3 text-right font-bold">Outstanding</th>
                    <th className="px-5 py-3 text-right font-bold">Overdue</th>
                    <th className="px-5 py-3 text-right font-bold">Credit period</th>
                    <th className="px-5 py-3 font-bold">Status</th>
                    <th className="px-5 py-3 font-bold">Discount</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((a) => (
                    <tr key={a.id} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                      <td className="px-5 py-3 font-bold text-navy dark:text-slate-100">{a.name}</td>
                      <td className="px-5 py-3 text-right font-semibold text-navy dark:text-slate-100">{formatCurrency(a.totalOutstanding)}</td>
                      <td className={`px-5 py-3 text-right font-semibold ${a.overdueAmount > 0 ? 'text-red-500' : 'text-navy dark:text-slate-100'}`}>
                        {formatCurrency(a.overdueAmount)}
                      </td>
                      <td className="px-5 py-3 text-right text-text-gray dark:text-slate-400">{a.creditPeriodDays} days</td>
                      <td className="px-5 py-3">{statusBadge(a)}</td>
                      <td className="px-5 py-3">
                        {a.isInViolation && a.discountPct > 0 ? <Badge tone="red">Suspended</Badge> : a.discountPct > 0 ? <Badge tone="green">{a.discountPct}%</Badge> : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <div className="p-5">
              <p className="mb-1 font-bold text-navy dark:text-slate-100">Send history</p>
              <p className="mb-4 text-xs text-text-gray dark:text-slate-400">Sent automatically every Saturday to dealers with an outstanding balance.</p>
              {reportLogsLoading ? (
                <TableSkeleton rows={4} />
              ) : reportLogs.length === 0 ? (
                <EmptyState icon={WalletIcon} title="No reports sent yet" description="The weekly Saturday report hasn't run yet, or no dealer had an outstanding balance." />
              ) : (
                <ul className="divide-y divide-border-soft dark:divide-slate-800">
                  {reportLogs.map((l) => (
                    <li key={l.id} className="flex items-center gap-3 py-3">
                      {l.sent ? <CheckCircle2Icon className="h-5 w-5 shrink-0 text-emerald-500" /> : <XCircleIcon className="h-5 w-5 shrink-0 text-red-500" />}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-navy dark:text-slate-100">{l.customer ?? l.to}</p>
                        <p className="truncate text-xs text-text-gray dark:text-slate-400">{l.sent ? l.message : l.error}</p>
                      </div>
                      <span className="shrink-0 text-xs text-text-gray dark:text-slate-400">{formatDate(l.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { StoreIcon, UsersIcon, WalletIcon, AlertTriangleIcon, MailIcon, PhoneIcon, UserIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardHeader } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { StatCard } from '../../components/ui/StatCard';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { Modal } from '../../components/ui/Modal';
import { DueDateCalendar, DueDateCalendarItem } from '../../components/ui/DueDateCalendar';
import { CustomerStatement } from '../../types/statement';
import { formatCurrency, formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

interface MyDealer {
  customerId: string;
  name: string;
  email?: string;
  phone?: string;
  contactPerson?: string;
  billingAddress?: string;
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
  returnedAmount: number;
  returnedQuantity: number;
  chequeReturnsCount: number;
  chequeReturnedAmount: number;
}

const PRIORITY_TONE: Record<string, 'red' | 'amber' | 'gray'> = { High: 'red', Medium: 'amber', Low: 'gray' };
const STATUS_TONE: Record<string, 'red' | 'gray' | 'green'> = { Blocked: 'red', Inactive: 'gray', Active: 'green' };

export function MyDealers() {
  const [salesperson, setSalesperson] = useState<{ id: string; name: string; code: string } | null | undefined>(undefined);
  const [dealers, setDealers] = useState<MyDealer[]>([]);
  const [dueDates, setDueDates] = useState<DueDateCalendarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDealer, setSelectedDealer] = useState<MyDealer | null>(null);
  const [statement, setStatement] = useState<CustomerStatement | null>(null);
  const [statementLoading, setStatementLoading] = useState(false);

  useEffect(() => {
    api
      .get<{ salesperson: { id: string; name: string; code: string } | null; dealers: MyDealer[] }>('/salespersons/me/dealers')
      .then(({ salesperson, dealers }) => {
        setSalesperson(salesperson);
        setDealers(dealers);
      })
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load your dealers'))
      .finally(() => setLoading(false));
    // Dealer Credit Control roadmap Module 5 — scoped server-side to this
    // rep's own dealers automatically (see due-dates.ts's own comment).
    api
      .get<{ dueDates: DueDateCalendarItem[] }>('/customer-invoices/due-dates')
      .then(({ dueDates }) => setDueDates(dueDates))
      .catch(() => setDueDates([]));
  }, []);

  useEffect(() => {
    if (!selectedDealer) {
      setStatement(null);
      return;
    }
    setStatementLoading(true);
    api
      .get<CustomerStatement>(`/customers/${selectedDealer.customerId}/statement`)
      .then(setStatement)
      .catch(() => setStatement(null))
      .finally(() => setStatementLoading(false));
  }, [selectedDealer]);

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

          {dueDates.length > 0 &&
        <Card className="mb-6">
              <CardHeader title="Due dates" subtitle="When your dealers' invoices come due" />
              <div className="p-5">
                <DueDateCalendar items={dueDates} />
              </div>
            </Card>
        }

          <Card>
            <ul className="divide-y divide-border-soft dark:divide-slate-800">
              {dealers.map((d) =>
            <li
              key={d.customerId}
              onClick={() => setSelectedDealer(d)}
              className="flex cursor-pointer flex-wrap items-center justify-between gap-3 p-4 transition hover:bg-soft-gray dark:hover:bg-slate-800/50">

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
                    {d.returnedQuantity > 0 &&
                <div>
                        <p className="text-xs text-text-gray dark:text-slate-400">Goods returned</p>
                        <p className="font-semibold text-navy dark:text-slate-100">{d.returnedQuantity} pcs · {formatCurrency(d.returnedAmount)}</p>
                      </div>
                }
                    {d.chequeReturnsCount > 0 &&
                <div>
                        <p className="text-xs text-text-gray dark:text-slate-400">Cheque returns</p>
                        <p className="font-semibold text-red-500">{d.chequeReturnsCount} · {formatCurrency(d.chequeReturnedAmount)}</p>
                      </div>
                }
                  </div>
                </li>
            )}
            </ul>
          </Card>
        </>
      }

      <Modal open={!!selectedDealer} onClose={() => setSelectedDealer(null)} title={selectedDealer?.name ?? ''} size="lg">
        {selectedDealer &&
        <div>
            <div className="flex items-center gap-2">
              <Badge tone={STATUS_TONE[selectedDealer.status]}>{selectedDealer.status}</Badge>
              <Badge tone={PRIORITY_TONE[selectedDealer.priority]}>{selectedDealer.priority} priority</Badge>
              {selectedDealer.isInViolation && <Badge tone="red">{selectedDealer.daysPastCreditPeriod}d overdue</Badge>}
            </div>

            <div className="mt-3 space-y-1 text-sm text-text-gray dark:text-slate-400">
              {selectedDealer.email && <p className="flex items-center gap-1.5"><MailIcon className="h-3.5 w-3.5" /> {selectedDealer.email}</p>}
              {selectedDealer.phone && <p className="flex items-center gap-1.5"><PhoneIcon className="h-3.5 w-3.5" /> {selectedDealer.phone}</p>}
              {selectedDealer.contactPerson && <p className="flex items-center gap-1.5"><UserIcon className="h-3.5 w-3.5" /> {selectedDealer.contactPerson}</p>}
              {selectedDealer.billingAddress && <p>{selectedDealer.billingAddress}</p>}
              <p>{selectedDealer.territory ? `${selectedDealer.territory} · ` : ''}{selectedDealer.visitFrequency} visits</p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatCard label="Outstanding" value={formatCurrency(selectedDealer.totalOutstanding)} icon={WalletIcon} />
              <StatCard label="Credit limit" value={selectedDealer.creditLimit > 0 ? formatCurrency(selectedDealer.creditLimit) : '—'} icon={WalletIcon} />
              {selectedDealer.creditUtilizationPct != null &&
            <StatCard label="Utilization" value={`${selectedDealer.creditUtilizationPct}%`} icon={WalletIcon} />
            }
              {selectedDealer.returnRatioPct != null &&
            <StatCard label="Return ratio" value={`${selectedDealer.returnRatioPct}%`} icon={AlertTriangleIcon} />
            }
              {selectedDealer.returnedQuantity > 0 &&
            <StatCard label="Goods returned" value={`${selectedDealer.returnedQuantity} pcs / ${formatCurrency(selectedDealer.returnedAmount)}`} icon={AlertTriangleIcon} />
            }
              {selectedDealer.chequeReturnsCount > 0 &&
            <StatCard label="Cheque returns" value={`${selectedDealer.chequeReturnsCount} / ${formatCurrency(selectedDealer.chequeReturnedAmount)}`} icon={AlertTriangleIcon} />
            }
            </div>

            <div className="mt-5">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Recent invoices</p>
              {statementLoading ?
            <p className="text-sm text-text-gray dark:text-slate-400">Loading…</p> :
            !statement || statement.invoices.length === 0 ?
            <p className="text-sm text-text-gray dark:text-slate-400">No invoices yet.</p> :

            <div className="max-h-64 overflow-y-auto">
                  <ul className="divide-y divide-border-soft dark:divide-slate-800">
                    {statement.invoices.slice(0, 20).map((inv) =>
                <li key={inv.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-navy dark:text-slate-100">{inv.invoiceNumber}</p>
                          <p className="text-xs text-text-gray dark:text-slate-400">{formatDate(inv.createdAt)}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-semibold text-navy dark:text-slate-100">{formatCurrency(inv.total)}</p>
                          <p className="text-xs text-text-gray dark:text-slate-400">{inv.status}{inv.balance > 0 ? ` · ${formatCurrency(inv.balance)} due` : ''}</p>
                        </div>
                      </li>
                )}
                  </ul>
                </div>
            }
            </div>
          </div>
        }
      </Modal>
    </div>);

}

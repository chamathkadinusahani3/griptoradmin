import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ArrowLeftRightIcon, ArrowDownIcon, ArrowUpIcon, WalletIcon, ClipboardCheckIcon, ClockIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { StatCard } from '../../components/ui/StatCard';
import { Badge } from '../../components/ui/Badge';
import { Toggle } from '../../components/ui/Toggle';
import { EmptyState } from '../../components/ui/EmptyState';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { BankTransaction, BankTransactionSummary } from '../../types/bankTransaction';
import { formatCurrency, formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

const DIRECTION_FILTERS: ('All' | 'in' | 'out')[] = ['All', 'in', 'out'];
const DIRECTION_LABEL: Record<'in' | 'out', string> = { in: 'In', out: 'Out' };

export function Transactions() {
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [summary, setSummary] = useState<BankTransactionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [directionFilter, setDirectionFilter] = useState<'All' | 'in' | 'out'>('All');
  const [pendingOnly, setPendingOnly] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api
      .get<{ transactions: BankTransaction[]; summary: BankTransactionSummary }>('/tenant/bank-transactions')
      .then(({ transactions, summary }) => {
        setTransactions(transactions);
        setSummary(summary);
      })
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load transactions'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const toggleReconciled = async (t: BankTransaction) => {
    if (!t.id) return;
    setTogglingId(t.id);
    const nextReconciled = !t.reconciled;
    const previous = transactions;
    setTransactions((prev) => prev.map((x) => (x.id === t.id ? { ...x, reconciled: nextReconciled } : x)));
    try {
      if (t.sourceType === 'return') {
        await api.patch(`/returns/${t.sourceId}/reconcile`, { reconciled: nextReconciled });
      } else {
        const endpoint = t.sourceType === 'invoice' ? `/customer-invoices/${t.sourceId}/reconcile` : `/purchase-orders/${t.sourceId}/reconcile`;
        await api.patch(endpoint, { paymentId: t.id, reconciled: nextReconciled });
      }
      setSummary((prev) => (prev ? { ...prev, pendingReconciliation: prev.pendingReconciliation + (nextReconciled ? -1 : 1) } : prev));
    } catch (err) {
      setTransactions(previous);
      toast.error(err instanceof ApiError ? err.message : 'Failed to update reconciliation status');
    } finally {
      setTogglingId(null);
    }
  };

  const filtered = transactions
    .filter((t) => directionFilter === 'All' || t.direction === directionFilter)
    .filter((t) => !pendingOnly || !t.reconciled);

  return (
    <div>
      <PageHeader title="Transactions" description="Every recorded payment, both directions — mark each one reconciled once it clears your bank statement." />

      {summary &&
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Total in" value={formatCurrency(summary.totalIn)} icon={ArrowDownIcon} />
          <StatCard label="Total out" value={formatCurrency(summary.totalOut)} icon={ArrowUpIcon} />
          <StatCard label="Cheques" value={String(summary.chequeCount)} icon={WalletIcon} />
          <StatCard label="Pending reconciliation" value={String(summary.pendingReconciliation)} icon={ClockIcon} />
        </div>
      }

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {DIRECTION_FILTERS.map((d) =>
          <button
            key={d}
            onClick={() => setDirectionFilter(d)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${directionFilter === d ? 'bg-griptor-gradient text-white' : 'bg-soft-gray text-text-gray hover:bg-light-blue dark:bg-slate-800 dark:text-slate-300'}`}>

              {d === 'All' ? 'All' : DIRECTION_LABEL[d]}
            </button>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm text-text-gray dark:text-slate-400">
          Pending only
          <Toggle checked={pendingOnly} onChange={setPendingOnly} />
        </label>
      </div>

      {loading ?
      <Card><div className="p-5"><TableSkeleton rows={6} /></div></Card> :
      filtered.length === 0 ?
      <Card><EmptyState icon={ArrowLeftRightIcon} title="No transactions" description="Payments recorded on invoices or purchase orders will show up here." /></Card> :

      <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                  <th className="px-5 py-3 font-bold">Date</th>
                  <th className="px-5 py-3 font-bold">Direction</th>
                  <th className="px-5 py-3 font-bold">Party</th>
                  <th className="px-5 py-3 font-bold">Reference</th>
                  <th className="px-5 py-3 font-bold">Method</th>
                  <th className="px-5 py-3 font-bold">Bank account</th>
                  <th className="px-5 py-3 text-right font-bold">Amount</th>
                  <th className="px-5 py-3 text-center font-bold">Reconciled</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) =>
              <tr key={t.id} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">{formatDate(t.date)}</td>
                    <td className="px-5 py-3">
                      <Badge tone={t.direction === 'in' ? 'green' : 'amber'}>{DIRECTION_LABEL[t.direction]}</Badge>
                    </td>
                    <td className="px-5 py-3 font-semibold text-navy dark:text-slate-100">{t.party ?? '—'}</td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">{t.reference}</td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">
                      {t.method}{t.chequeNumber ? ` · #${t.chequeNumber}` : ''}
                    </td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">{t.bankAccount ?? '—'}</td>
                    <td className="px-5 py-3 text-right font-bold text-navy dark:text-slate-100">{formatCurrency(t.amount)}</td>
                    <td className="px-5 py-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {togglingId === t.id ?
                    <span className="text-xs text-text-gray dark:text-slate-400">…</span> :

                    <Toggle checked={t.reconciled} onChange={() => toggleReconciled(t)} />
                    }
                        {t.reconciled && <ClipboardCheckIcon className="h-3.5 w-3.5 text-emerald-500" />}
                      </div>
                    </td>
                  </tr>
              )}
              </tbody>
            </table>
          </div>
        </Card>
      }
    </div>);

}

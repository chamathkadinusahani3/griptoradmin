import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { BookOpenIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardHeader } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { JournalEntriesResponse } from '../../types/journalEntry';
import { formatCurrency, formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

type RangeKey = '30' | '90' | '365' | 'custom';
const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: '30', label: 'Last 30 days' },
  { key: '90', label: 'Last 90 days' },
  { key: '365', label: 'This year' },
  { key: 'custom', label: 'Custom' },
];
const SOURCE_LABEL: Record<string, string> = {
  sale: 'POS Sale',
  'customer-payment': 'Invoice Payment',
  'supplier-payment': 'Supplier Payment',
  expense: 'Expense',
  payroll: 'Payroll',
  'return-refund': 'Return Refund',
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoIso(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function GeneralLedger() {
  const [range, setRange] = useState<RangeKey>('30');
  const [customFrom, setCustomFrom] = useState(daysAgoIso(30));
  const [customTo, setCustomTo] = useState(todayIso());
  const [data, setData] = useState<JournalEntriesResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (range === 'custom' && (!customFrom || !customTo || customFrom > customTo)) return;
    setLoading(true);
    const query = range === 'custom' ? `range=custom&from=${customFrom}&to=${customTo}` : `range=${range}`;
    api
      .get<JournalEntriesResponse>(`/journal-entries?${query}`)
      .then(setData)
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load general ledger'))
      .finally(() => setLoading(false));
  }, [range, customFrom, customTo]);

  return (
    <div>
      <PageHeader title="General Ledger" description="Every double-entry journal entry auto-posted from sales, payments, expenses, payroll, and refunds — nothing here is entered directly." />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {RANGE_OPTIONS.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${range === r.key ? 'bg-griptor-gradient text-white' : 'bg-soft-gray text-text-gray hover:bg-light-blue dark:bg-slate-800 dark:text-slate-300'}`}
          >
            {r.label}
          </button>
        ))}
        {range === 'custom' && (
          <div className="flex items-center gap-2">
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="rounded-lg border border-border-soft bg-white px-2.5 py-1.5 text-xs text-navy dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
            <span className="text-xs text-text-gray dark:text-slate-400">to</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="rounded-lg border border-border-soft bg-white px-2.5 py-1.5 text-xs text-navy dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
          </div>
        )}
      </div>

      {loading || !data ? (
        <div className="space-y-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <Card className="mb-6">
            <CardHeader title="Account totals" subtitle="Debit/credit totals per account for the selected range" />
            {data.accountTotals.length === 0 ? (
              <div className="p-5"><EmptyState icon={BookOpenIcon} title="Nothing posted yet" description="Journal entries will appear here as sales, payments, expenses, payroll, and refunds happen." /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                      <th className="px-5 py-3 font-bold">Account</th>
                      <th className="px-5 py-3 text-right font-bold">Debit</th>
                      <th className="px-5 py-3 text-right font-bold">Credit</th>
                      <th className="px-5 py-3 text-right font-bold">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.accountTotals.map((t) => (
                      <tr key={t.accountId} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                        <td className="px-5 py-3 font-semibold text-navy dark:text-slate-100">{t.accountName}</td>
                        <td className="px-5 py-3 text-right text-text-gray dark:text-slate-400">{formatCurrency(t.debit)}</td>
                        <td className="px-5 py-3 text-right text-text-gray dark:text-slate-400">{formatCurrency(t.credit)}</td>
                        <td className={`px-5 py-3 text-right font-bold ${t.net >= 0 ? 'text-navy dark:text-slate-100' : 'text-red-600 dark:text-red-400'}`}>{formatCurrency(t.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Journal entries" />
            {data.entries.length === 0 ? (
              <div className="p-5"><EmptyState icon={BookOpenIcon} title="No entries in this range" description="Try a wider date range." /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                      <th className="px-5 py-3 font-bold">Date</th>
                      <th className="px-5 py-3 font-bold">Description</th>
                      <th className="px-5 py-3 font-bold">Source</th>
                      <th className="px-5 py-3 font-bold">Lines</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.entries.map((e) => (
                      <tr key={e.id} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                        <td className="px-5 py-3 text-text-gray dark:text-slate-400">{formatDate(e.date)}</td>
                        <td className="px-5 py-3 font-semibold text-navy dark:text-slate-100">{e.description}</td>
                        <td className="px-5 py-3"><Badge tone="gray">{SOURCE_LABEL[e.sourceType] ?? e.sourceType}</Badge></td>
                        <td className="px-5 py-3 text-text-gray dark:text-slate-400">
                          {e.lines.map((l, i) => (
                            <div key={i}>
                              {l.accountName} — {l.debit > 0 ? `Dr ${formatCurrency(l.debit)}` : `Cr ${formatCurrency(l.credit)}`}
                            </div>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

import React, { useMemo, useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { formatCurrency } from '../../lib/utils';

export interface DueDateCalendarItem {
  /** YYYY-MM-DD or ISO date string. */
  date: string;
  invoiceId: string;
  invoiceNumber: string;
  customerName?: string;
  amount: number;
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Dealer Credit Control roadmap Module 5, Phase 5.2 — the app's first real
 * calendar-grid UI. Hand-rolled (plain Date math, no new npm dependency),
 * matching this codebase's existing "no new shared heavy component, keep
 * it hand-built per page" discipline (see e.g. tables staying hand-rolled
 * everywhere rather than a shared Table component). Scoped to due-date
 * display only for this first cut, not general event scheduling.
 */
export function DueDateCalendar({ items }: { items: DueDateCalendarItem[] }) {
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const itemsByDay = useMemo(() => {
    const map = new Map<string, DueDateCalendarItem[]>();
    for (const item of items) {
      const key = toDayKey(new Date(item.date));
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return map;
  }, [items]);

  const todayKey = toDayKey(new Date());

  const cells = useMemo(() => {
    const year = monthCursor.getFullYear();
    const month = monthCursor.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const leadingBlanks = firstOfMonth.getDay();
    const totalCells = Math.ceil((leadingBlanks + daysInMonth) / 7) * 7;

    return Array.from({ length: totalCells }, (_, i) => {
      const dayNum = i - leadingBlanks + 1;
      if (dayNum < 1 || dayNum > daysInMonth) return null;
      const date = new Date(year, month, dayNum);
      return { key: toDayKey(date), dayNum };
    });
  }, [monthCursor]);

  const selectedItems = selectedDay ? itemsByDay.get(selectedDay) ?? [] : [];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMonthCursor((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
          className="rounded-lg p-1.5 text-text-gray hover:bg-soft-gray dark:text-slate-400 dark:hover:bg-slate-800"
          aria-label="Previous month">
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        <p className="text-sm font-bold text-navy dark:text-slate-100">
          {monthCursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </p>
        <button
          type="button"
          onClick={() => setMonthCursor((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
          className="rounded-lg p-1.5 text-text-gray hover:bg-soft-gray dark:text-slate-400 dark:hover:bg-slate-800"
          aria-label="Next month">
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-text-gray dark:text-slate-400">
        {WEEKDAY_LABELS.map((w) => <div key={w} className="py-1">{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, i) => {
          if (!cell) return <div key={i} />;
          const dayItems = itemsByDay.get(cell.key) ?? [];
          const isToday = cell.key === todayKey;
          const isOverdue = cell.key < todayKey && dayItems.length > 0;
          const isSelected = cell.key === selectedDay;
          return (
            <button
              key={cell.key}
              type="button"
              onClick={() => setSelectedDay(cell.key === selectedDay ? null : cell.key)}
              className={`flex aspect-square flex-col items-center justify-center rounded-lg border text-xs transition ${
                isSelected
                  ? 'border-royal bg-royal/10 dark:border-blue-400 dark:bg-blue-400/10'
                  : isToday
                  ? 'border-teal bg-teal/5 dark:border-teal dark:bg-teal/10'
                  : 'border-transparent hover:bg-soft-gray dark:hover:bg-slate-800'
              }`}>
              <span className={`font-semibold ${isOverdue ? 'text-red-500' : 'text-navy dark:text-slate-100'}`}>{cell.dayNum}</span>
              {dayItems.length > 0 && (
                <span className={`mt-0.5 h-1.5 w-1.5 rounded-full ${isOverdue ? 'bg-red-500' : 'bg-teal'}`} />
              )}
            </button>
          );
        })}
      </div>

      {selectedDay && (
        <div className="mt-4 rounded-xl border border-border-soft p-3 dark:border-slate-800">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
            Due {new Date(selectedDay).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
          {selectedItems.length === 0 ? (
            <p className="text-sm text-text-gray dark:text-slate-400">Nothing due this day.</p>
          ) : (
            <ul className="space-y-1.5">
              {selectedItems.map((item) => (
                <li key={item.invoiceId} className="flex items-center justify-between text-sm">
                  <span className="text-navy dark:text-slate-100">{item.invoiceNumber} — {item.customerName ?? 'Unknown customer'}</span>
                  <span className="font-semibold text-navy dark:text-slate-100">{formatCurrency(item.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

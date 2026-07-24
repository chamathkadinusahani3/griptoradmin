import React from "react";
import { TrendingUpIcon, TrendingDownIcon, BoxIcon } from "lucide-react";
import { Card } from "./Card";
import { cn } from "../../lib/utils";
export function StatCard({
  label,
  value,
  icon: Icon,
  delta,
  deltaDirection = 'up',
  hint







}: {label: string;value: string;icon: BoxIcon;delta?: string;deltaDirection?: 'up' | 'down';hint?: string;}) {
  const positive = deltaDirection === 'up';
  return <Card className="p-5">
      <div className="flex items-start justify-between">
        <p className="text-sm font-semibold text-text-gray dark:text-slate-400">{label}</p>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-light-blue text-teal dark:bg-teal/15">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-3 text-3xl font-extrabold tracking-tight text-navy dark:text-slate-100">{value}</p>
      <div className="mt-2 flex items-center gap-2">
        {delta && <span className={cn('inline-flex items-center gap-1 text-xs font-bold', positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400')}>
            {positive ? <TrendingUpIcon className="h-3.5 w-3.5" /> : <TrendingDownIcon className="h-3.5 w-3.5" />}
            {delta}
          </span>}
        {hint && <span className="text-xs text-text-gray dark:text-slate-500">{hint}</span>}
      </div>
    </Card>;
}
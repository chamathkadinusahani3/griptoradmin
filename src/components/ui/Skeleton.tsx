


import React from 'react';
import { cn } from '../../lib/utils';

export function Skeleton({ className }: {className?: string;}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg bg-slate-200/70 dark:bg-slate-700/50',
        className
      )}>
      
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/40 to-transparent dark:via-white/10" />
    </div>);

}

export function CardSkeleton() {
  return (
    <div className="rounded-2xl border border-border-soft bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-slate-900">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-4 h-8 w-32" />
      <Skeleton className="mt-3 h-3 w-20" />
    </div>);

}

export function TableSkeleton({ rows = 6 }: {rows?: number;}) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) =>
      <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16" />
        </div>
      )}
    </div>);

}
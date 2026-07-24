


import React from 'react';
import { cn } from '../../lib/utils';

type Tone = 'gray' | 'green' | 'blue' | 'teal' | 'amber' | 'red' | 'purple';

const toneMap: Record<Tone, string> = {
  gray: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  blue: 'bg-blue-50 text-royal dark:bg-blue-500/15 dark:text-blue-300',
  teal: 'bg-light-blue text-teal dark:bg-teal/15 dark:text-cyan',
  amber: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  red: 'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300',
  purple: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300'
};

export function Badge({
  children,
  tone = 'gray',
  className,
  dot = false





}: {children: React.ReactNode;tone?: Tone;className?: string;dot?: boolean;}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold',
        toneMap[tone],
        className
      )}>
      
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>);

}
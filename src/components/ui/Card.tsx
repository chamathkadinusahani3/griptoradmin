


import React from 'react';
import { cn } from '../../lib/utils';

export function Card({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-border-soft bg-white shadow-soft dark:border-slate-800 dark:bg-slate-900',
        className
      )}
      {...props}>
      
      {children}
    </div>);

}

export function CardHeader({
  title,
  subtitle,
  action,
  className





}: {title: React.ReactNode;subtitle?: React.ReactNode;action?: React.ReactNode;className?: string;}) {
  return (
    <div className={cn('flex items-start justify-between gap-4 px-5 pt-5', className)}>
      <div>
        <h3 className="text-base font-bold text-navy dark:text-slate-100">{title}</h3>
        {subtitle && <p className="mt-0.5 text-sm text-text-gray dark:text-slate-400">{subtitle}</p>}
      </div>
      {action}
    </div>);

}
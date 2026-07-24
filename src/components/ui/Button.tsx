


import React from 'react';
import { cn } from '../../lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: React.ReactNode;
}

const sizeMap: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2'
};

const variantMap: Record<Variant, string> = {
  primary:
  'bg-griptor-gradient text-white shadow-soft hover:opacity-95 active:opacity-90 border border-transparent',
  secondary:
  'bg-white text-navy border border-border-soft hover:bg-soft-gray dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700 dark:hover:bg-slate-700',
  ghost:
  'bg-transparent text-text-gray hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 border border-transparent',
  outline:
  'bg-transparent text-royal border border-royal/40 hover:bg-blue-50 dark:text-blue-300 dark:border-blue-400/40 dark:hover:bg-blue-500/10',
  danger:
  'bg-red-600 text-white hover:bg-red-700 border border-transparent'
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-xl font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50',
        sizeMap[size],
        variantMap[variant],
        className
      )}
      disabled={disabled || loading}
      {...props}>
      
      {loading &&
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      }
      {children}
    </button>);

}
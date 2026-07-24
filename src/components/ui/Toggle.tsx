



import React from 'react';
import { cn } from '../../lib/utils';

export function Toggle({
  checked,
  onChange,
  disabled,
  label,
  size = 'md'






}: {checked: boolean;onChange: (next: boolean) => void;disabled?: boolean;label?: string;size?: 'sm' | 'md';}) {
  const dims = size === 'sm' ? { w: 'w-9', h: 'h-5', k: 'h-4 w-4', t: 'translate-x-4' } : { w: 'w-11', h: 'h-6', k: 'h-5 w-5', t: 'translate-x-5' };
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        dims.w,
        dims.h,
        checked ? 'bg-griptor-gradient-soft' : 'bg-slate-300 dark:bg-slate-600'
      )}>
      
      <span
        className={cn(
          'inline-block transform rounded-full bg-white shadow transition-transform',
          dims.k,
          'translate-x-0.5',
          checked && dims.t
        )} />
      
    </button>);

}
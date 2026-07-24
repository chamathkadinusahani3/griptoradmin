




import React from 'react';
import { initials, cn } from '../../lib/utils';

export function Avatar({
  name,
  src,
  size = 'md',
  className





}: {name: string;src?: string;size?: 'sm' | 'md' | 'lg';className?: string;}) {
  const dims = size === 'sm' ? 'h-8 w-8 text-xs' : size === 'lg' ? 'h-12 w-12 text-base' : 'h-10 w-10 text-sm';
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={cn('rounded-full object-cover', dims, className)} />);


  }
  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-full bg-griptor-gradient-soft font-bold text-white',
        dims,
        className
      )}
      aria-hidden="true">
      
      {initials(name)}
    </div>);

}
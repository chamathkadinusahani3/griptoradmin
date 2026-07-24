import React from 'react';
import { useAuth } from '../../context/AuthContext';

export function Logo({ collapsed = false }: {collapsed?: boolean;}) {
  const { user } = useAuth();
  // Tenant portal is white-labeled: their own logo + company name instead of
  // GRIPTOR's. Super admin views always show the real GRIPTOR branding.
  const isTenant = user?.role === 'tenant';
  const logoSrc = isTenant && user.branding?.logoDataUrl ? user.branding.logoDataUrl : '/logo.png';

  return (
    <div className="flex items-center gap-2.5">
      <img src={logoSrc} alt={isTenant ? user.garageName : 'GRIPTOR'} className="h-9 w-9 shrink-0 rounded-lg object-contain" />
      {!collapsed && isTenant &&
      <div className="flex min-w-0 flex-col leading-none">
          <span className="truncate text-base font-extrabold tracking-tight text-navy dark:text-white">
            {user.garageName}
          </span>
          <span className="mt-1 truncate text-[9px] font-bold uppercase tracking-[0.2em] text-text-gray dark:text-slate-500">
            Powered by GRIPTOR
          </span>
        </div>
      }
      {!collapsed && !isTenant &&
      <div className="flex min-w-0 flex-col leading-none">
          <span className="truncate text-base font-extrabold tracking-tight">
            <span className="text-navy dark:text-white">GRIPTOR</span>{' '}
            <span className="text-teal">TECH</span>
          </span>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="h-px flex-1 bg-border-soft dark:bg-slate-700" />
            <span className="shrink-0 text-[8px] font-bold tracking-[0.25em] text-text-gray dark:text-slate-500">PVT LTD</span>
            <span className="h-px flex-1 bg-border-soft dark:bg-slate-700" />
          </div>
        </div>
      }
    </div>);

}

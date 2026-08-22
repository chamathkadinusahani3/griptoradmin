







import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { NavGroup } from './navConfig';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { ImpersonationBanner } from './ImpersonationBanner';
import { useAuth } from '../../context/AuthContext';

export function DashboardLayout({
  navGroups,
  footerSlot



}: {navGroups: NavGroup[];footerSlot?: React.ReactNode;}) {
  const { user } = useAuth();
  // Seeded from the tenant's chosen sidebar-style default (Settings page) —
  // undefined/'expanded' for super admin or any tenant that never set one,
  // so this is a no-op there. The manual collapse/expand button below still
  // works unchanged for the rest of the session; this only changes the
  // starting point on each fresh mount.
  const [collapsed, setCollapsed] = useState(() => user?.branding?.sidebarStyle === 'compact');
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-soft-gray dark:bg-slate-950 print:h-auto print:overflow-visible print:bg-white">
      <div className="print:hidden">
        <Sidebar
          groups={navGroups}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((v) => !v)}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
          footerSlot={footerSlot} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col print:block">
        <div className="print:hidden">
          <ImpersonationBanner />
          <Topbar onOpenMobile={() => setMobileOpen(true)} />
        </div>
        <main className="scrollbar-thin flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8 print:overflow-visible print:p-0">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>);

}








import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { NavGroup } from './navConfig';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function DashboardLayout({
  navGroups,
  footerSlot



}: {navGroups: NavGroup[];footerSlot?: React.ReactNode;}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-soft-gray dark:bg-slate-950">
      <Sidebar
        groups={navGroups}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((v) => !v)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        footerSlot={footerSlot} />
      
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenMobile={() => setMobileOpen(true)} />
        <main className="scrollbar-thin flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>);

}
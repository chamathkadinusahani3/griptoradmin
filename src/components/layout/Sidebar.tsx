





import React from 'react';
import { NavLink } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeftIcon, XIcon, SparklesIcon } from 'lucide-react';
import { NavGroup } from './navConfig';
import { Logo } from './Logo';
import { cn } from '../../lib/utils';

interface SidebarProps {
  groups: NavGroup[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  footerSlot?: React.ReactNode;
}

function NavList({ groups, collapsed, onNavigate }: {groups: NavGroup[];collapsed: boolean;onNavigate?: () => void;}) {
  return (
    <nav className="scrollbar-thin flex-1 space-y-6 overflow-y-auto px-3 py-4">
      {groups.map((group, gi) =>
      <div key={gi}>
          {group.heading && !collapsed &&
        <p className="mb-2 px-3 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {group.heading}
            </p>
        }
          <div className="space-y-1">
            {group.items.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/admin' || item.to === '/app'}
                onClick={onNavigate}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                cn(
                  'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition',
                  collapsed && 'justify-center',
                  isActive ?
                  'bg-griptor-gradient text-white shadow-soft' :
                  'text-text-gray hover:bg-light-blue/60 hover:text-navy dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
                )
                }>
                
                  <Icon className="h-5 w-5 shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </NavLink>);

          })}
          </div>
        </div>
      )}
    </nav>);

}

export function Sidebar({
  groups,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
  footerSlot
}: SidebarProps) {
  return (
    <>
      {/* Desktop */}
      <aside
        className={cn(
          'hidden shrink-0 flex-col border-r border-border-soft bg-white transition-all duration-300 dark:border-slate-800 dark:bg-slate-900 lg:flex',
          collapsed ? 'w-[76px]' : 'w-64'
        )}>
        
        <div className={cn('flex h-16 items-center border-b border-border-soft px-4 dark:border-slate-800', collapsed ? 'justify-center' : 'justify-between')}>
          <Logo collapsed={collapsed} />
          {!collapsed &&
          <button
            onClick={onToggleCollapse}
            aria-label="Collapse sidebar"
            className="rounded-lg p-1.5 text-text-gray transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">
            
              <ChevronLeftIcon className="h-5 w-5" />
            </button>
          }
        </div>
        {collapsed &&
        <button
          onClick={onToggleCollapse}
          aria-label="Expand sidebar"
          className="mx-auto mt-3 rounded-lg p-1.5 text-text-gray transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">
          
            <ChevronLeftIcon className="h-5 w-5 rotate-180" />
          </button>
        }
        <NavList groups={groups} collapsed={collapsed} />
        {footerSlot && !collapsed && <div className="border-t border-border-soft p-3 dark:border-slate-800">{footerSlot}</div>}
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen &&
        <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div
            className="absolute inset-0 bg-navy/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCloseMobile} />
          
            <motion.aside
            className="absolute left-0 top-0 flex h-full w-72 flex-col bg-white dark:bg-slate-900"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}>
            
              <div className="flex h-16 items-center justify-between border-b border-border-soft px-4 dark:border-slate-800">
                <Logo />
                <button
                onClick={onCloseMobile}
                aria-label="Close menu"
                className="rounded-lg p-1.5 text-text-gray transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">
                
                  <XIcon className="h-5 w-5" />
                </button>
              </div>
              <NavList groups={groups} collapsed={false} onNavigate={onCloseMobile} />
              {footerSlot && <div className="border-t border-border-soft p-3 dark:border-slate-800">{footerSlot}</div>}
            </motion.aside>
          </div>
        }
      </AnimatePresence>
    </>);

}

export function UpgradeCard() {
  return (
    <div className="rounded-2xl bg-griptor-gradient p-4 text-white shadow-soft">
      <div className="flex items-center gap-2">
        <SparklesIcon className="h-4 w-4" />
        <span className="text-sm font-bold">Unlock more</span>
      </div>
      <p className="mt-1 text-xs text-white/85">Add Marketing Automation & Fleet Management.</p>
    </div>);

}
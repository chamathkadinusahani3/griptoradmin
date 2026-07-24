






import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  MenuIcon,
  SearchIcon,
  BellIcon,
  SunIcon,
  MoonIcon,
  ChevronDownIcon,
  LogOutIcon,
  UserIcon,
  SettingsIcon } from
'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { Avatar } from '../ui/Avatar';
import { relativeTime } from '../../lib/utils';

const NOTIFICATIONS = [
{ id: 'n1', title: 'New lead from Owens Auto', time: '2026-07-16T14:20:00' },
{ id: 'n2', title: 'Invoice INV-2037 payment failed', time: '2026-07-16T09:10:00' },
{ id: 'n3', title: 'Ticket T-3010 marked urgent', time: '2026-07-15T17:40:00' }];


export function Topbar({ onOpenMobile }: {onOpenMobile: () => void;}) {
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [notifOpen, setNotifOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border-soft bg-white/80 px-4 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/80 sm:px-6">
      <button
        onClick={onOpenMobile}
        aria-label="Open menu"
        className="rounded-lg p-2 text-text-gray transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 lg:hidden">
        
        <MenuIcon className="h-5 w-5" />
      </button>

      <div className="relative hidden max-w-md flex-1 sm:block">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          placeholder="Search clients, jobs, customers…"
          aria-label="Search"
          className="h-10 w-full rounded-xl border border-border-soft bg-soft-gray pl-9 pr-3 text-sm text-navy placeholder:text-slate-400 transition focus:border-bright-blue focus:bg-white focus:ring-2 focus:ring-bright-blue/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
        
      </div>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <button
          onClick={toggleTheme}
          aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          className="rounded-xl p-2.5 text-text-gray transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
          
          {theme === 'light' ? <MoonIcon className="h-5 w-5" /> : <SunIcon className="h-5 w-5" />}
        </button>

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotifOpen((v) => !v)}
            aria-label="Notifications"
            className="relative rounded-xl p-2.5 text-text-gray transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
            
            <BellIcon className="h-5 w-5" />
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-cyan ring-2 ring-white dark:ring-slate-900" />
          </button>
          <AnimatePresence>
            {notifOpen &&
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              className="absolute right-0 mt-2 w-80 overflow-hidden rounded-2xl border border-border-soft bg-white shadow-soft-lg dark:border-slate-800 dark:bg-slate-900">
              
                <div className="border-b border-border-soft px-4 py-3 dark:border-slate-800">
                  <p className="text-sm font-bold text-navy dark:text-slate-100">Notifications</p>
                </div>
                <ul className="max-h-80 overflow-y-auto">
                  {NOTIFICATIONS.map((n) =>
                <li
                  key={n.id}
                  className="flex items-start gap-3 border-b border-border-soft px-4 py-3 last:border-0 hover:bg-soft-gray dark:border-slate-800 dark:hover:bg-slate-800/60">
                  
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-bright-blue" />
                      <div>
                        <p className="text-sm text-navy dark:text-slate-200">{n.title}</p>
                        <p className="text-xs text-text-gray dark:text-slate-500">{relativeTime(n.time)}</p>
                      </div>
                    </li>
                )}
                </ul>
              </motion.div>
            }
          </AnimatePresence>
        </div>

        {/* User menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-xl p-1.5 pr-2 transition hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="User menu">
            
            <Avatar name={user?.name || 'User'} src={user?.avatar} size="sm" />
            <div className="hidden text-left sm:block">
              <p className="text-sm font-bold leading-tight text-navy dark:text-slate-100">{user?.name}</p>
              <p className="text-xs leading-tight text-text-gray dark:text-slate-400">
                {user?.role === 'super' ? 'GRIPTOR Staff' : user?.garageName}
              </p>
            </div>
            <ChevronDownIcon className="hidden h-4 w-4 text-text-gray sm:block" />
          </button>
          <AnimatePresence>
            {menuOpen &&
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              className="absolute right-0 mt-2 w-56 overflow-hidden rounded-2xl border border-border-soft bg-white shadow-soft-lg dark:border-slate-800 dark:bg-slate-900">
              
                <div className="border-b border-border-soft px-4 py-3 dark:border-slate-800">
                  <p className="text-sm font-bold text-navy dark:text-slate-100">{user?.name}</p>
                  <p className="truncate text-xs text-text-gray dark:text-slate-400">{user?.email}</p>
                </div>
                <div className="p-1.5">
                  <button className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-text-gray transition hover:bg-soft-gray dark:text-slate-300 dark:hover:bg-slate-800">
                    <UserIcon className="h-4 w-4" /> Profile
                  </button>
                  <button className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-text-gray transition hover:bg-soft-gray dark:text-slate-300 dark:hover:bg-slate-800">
                    <SettingsIcon className="h-4 w-4" /> Settings
                  </button>
                  <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10">
                  
                    <LogOutIcon className="h-4 w-4" /> Sign out
                  </button>
                </div>
              </motion.div>
            }
          </AnimatePresence>
        </div>
      </div>
    </header>);

}



import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { XIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md'







}: {open: boolean;onClose: () => void;title: string;children: React.ReactNode;footer?: React.ReactNode;size?: 'sm' | 'md' | 'lg' | 'xl';}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const sizeMap = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

  return createPortal(
    <AnimatePresence>
      {open &&
      <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
          <motion.div
          className="absolute inset-0 bg-navy/40 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose} />
        
          <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className={cn(
            'relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-soft-lg dark:bg-slate-900 sm:rounded-3xl',
            sizeMap[size]
          )}
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}>
          
            <div className="flex items-center justify-between border-b border-border-soft px-6 py-4 dark:border-slate-800">
              <h2 className="text-lg font-bold text-navy dark:text-slate-100">{title}</h2>
              <button
              onClick={onClose}
              aria-label="Close dialog"
              className="rounded-lg p-1.5 text-text-gray transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">
              
                <XIcon className="h-5 w-5" />
              </button>
            </div>
            <div className="scrollbar-thin flex-1 overflow-y-auto px-6 py-5">{children}</div>
            {footer &&
          <div className="flex items-center justify-end gap-3 border-t border-border-soft px-6 py-4 dark:border-slate-800">
                {footer}
              </div>
          }
          </motion.div>
        </div>
      }
    </AnimatePresence>,
    document.body
  );
}
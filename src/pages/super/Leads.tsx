










import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { LayoutGridIcon, ListIcon, MailIcon, BuildingIcon, ArrowRightIcon, InboxIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/StatusBadge';
import { EmptyState } from '../../components/ui/EmptyState';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { Lead, LeadStatus } from '../../types/lead';
import { formatDate, cn } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

const COLUMNS: {status: LeadStatus;tone: string;}[] = [
{ status: 'New', tone: 'border-t-royal' },
{ status: 'Contacted', tone: 'border-t-amber-400' },
{ status: 'Converted', tone: 'border-t-emerald-500' }];


const NEXT: Record<LeadStatus, LeadStatus | null> = {
  New: 'Contacted',
  Contacted: 'Converted',
  Converted: null
};

export function Leads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'kanban' | 'list'>('kanban');

  useEffect(() => {
    api
      .get<{ leads: Lead[] }>('/leads')
      .then(({ leads }) => setLeads(leads))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load leads'))
      .finally(() => setLoading(false));
  }, []);

  const advance = async (lead: Lead) => {
    const next = NEXT[lead.status];
    if (!next) return;
    const previous = leads;
    setLeads((prev) => prev.map((l) => l.id === lead.id ? { ...l, status: next } : l));
    try {
      await api.patch(`/leads/${lead.id}`, { status: next });
      toast.success(`${lead.name} moved to ${next}`);
    } catch (err) {
      setLeads(previous);
      toast.error(err instanceof ApiError ? err.message : 'Failed to update lead');
    }
  };

  return (
    <div>
      <PageHeader
        title="Leads"
        description="Contact-form submissions and sales pipeline."
        action={
        <div className="inline-flex rounded-xl border border-border-soft bg-white p-1 dark:border-slate-700 dark:bg-slate-800">
            {([
          { key: 'kanban', icon: LayoutGridIcon, label: 'Pipeline' },
          { key: 'list', icon: ListIcon, label: 'List' }] as
          const).map((v) =>
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition',
              view === v.key ? 'bg-griptor-gradient text-white' : 'text-text-gray dark:text-slate-300'
            )}>
            
                <v.icon className="h-4 w-4" /> {v.label}
              </button>
          )}
          </div>
        } />
      

      {loading ?
      <Card><div className="p-5"><TableSkeleton rows={5} /></div></Card> :
      view === 'kanban' ?
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {COLUMNS.map((col) => {
          const items = leads.filter((l) => l.status === col.status);
          return (
            <div key={col.status} className={cn('rounded-2xl border border-t-4 border-border-soft bg-white/60 p-3 dark:border-slate-800 dark:bg-slate-900/40', col.tone)}>
                <div className="mb-3 flex items-center justify-between px-1">
                  <h3 className="text-sm font-bold text-navy dark:text-slate-100">{col.status}</h3>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-text-gray dark:bg-slate-800 dark:text-slate-300">
                    {items.length}
                  </span>
                </div>
                <div className="space-y-3">
                  {items.length === 0 ?
                <p className="px-1 py-6 text-center text-xs text-slate-400">No leads here</p> :

                items.map((lead) =>
                <motion.div layout key={lead.id} className="rounded-xl border border-border-soft bg-white p-3.5 shadow-soft dark:border-slate-800 dark:bg-slate-900">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-bold text-navy dark:text-slate-100">{lead.name}</p>
                            <p className="flex items-center gap-1 text-xs text-text-gray dark:text-slate-400">
                              <BuildingIcon className="h-3 w-3" /> {lead.company}
                            </p>
                          </div>
                          <span className="text-[11px] text-slate-400">{formatDate(lead.date)}</span>
                        </div>
                        <p className="mt-2 line-clamp-2 text-sm text-text-gray dark:text-slate-400">{lead.message}</p>
                        <div className="mt-3 flex items-center justify-between">
                          <a href={`mailto:${lead.email}`} className="flex items-center gap-1 text-xs font-semibold text-royal hover:underline dark:text-blue-300">
                            <MailIcon className="h-3 w-3" /> Email
                          </a>
                          {NEXT[lead.status] &&
                    <Button size="sm" variant="ghost" onClick={() => advance(lead)}>
                              {NEXT[lead.status]} <ArrowRightIcon className="h-3.5 w-3.5" />
                            </Button>
                    }
                        </div>
                      </motion.div>
                )
                }
                </div>
              </div>);

        })}
        </div> :

      <Card>
          {leads.length === 0 ?
        <EmptyState icon={InboxIcon} title="No leads yet" /> :

        <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                    <th className="px-5 py-3 font-bold">Name</th>
                    <th className="px-5 py-3 font-bold">Company</th>
                    <th className="px-5 py-3 font-bold">Message</th>
                    <th className="px-5 py-3 font-bold">Status</th>
                    <th className="px-5 py-3 font-bold">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((l) =>
              <tr key={l.id} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                      <td className="px-5 py-3">
                        <p className="font-bold text-navy dark:text-slate-100">{l.name}</p>
                        <p className="text-xs text-text-gray dark:text-slate-400">{l.email}</p>
                      </td>
                      <td className="px-5 py-3 text-text-gray dark:text-slate-300">{l.company}</td>
                      <td className="max-w-xs px-5 py-3 text-text-gray dark:text-slate-400"><span className="line-clamp-1">{l.message}</span></td>
                      <td className="px-5 py-3"><StatusBadge status={l.status} /></td>
                      <td className="px-5 py-3 text-text-gray dark:text-slate-400">{formatDate(l.date)}</td>
                    </tr>
              )}
                </tbody>
              </table>
            </div>
        }
        </Card>
      }
    </div>);

}
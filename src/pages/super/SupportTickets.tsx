import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { SendIcon, LifeBuoyIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Textarea } from '../../components/ui/Input';
import { Avatar } from '../../components/ui/Avatar';
import { StatusBadge } from '../../components/StatusBadge';
import { EmptyState } from '../../components/ui/EmptyState';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { Ticket } from '../../types/ticket';
import { relativeTime, cn } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

export function SupportTickets() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string>('');
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api
      .get<{ tickets: Ticket[] }>('/tickets')
      .then(({ tickets }) => {
        setTickets(tickets);
        if (tickets.length > 0) setSelectedId(tickets[0].id);
      })
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load tickets'))
      .finally(() => setLoading(false));
  }, []);

  const selected = tickets.find((t) => t.id === selectedId);

  const sendReply = async () => {
    if (!reply.trim() || !selected) return;
    setSending(true);
    try {
      const { ticket } = await api.patch<{ ticket: Ticket }>(`/tickets/${selected.id}`, { reply: reply.trim() });
      setTickets((prev) => prev.map((t) => t.id === ticket.id ? ticket : t));
      setReply('');
      toast.success('Reply sent');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to send reply');
    } finally {
      setSending(false);
    }
  };

  const resolve = async () => {
    if (!selected) return;
    const previous = tickets;
    setTickets((prev) => prev.map((t) => t.id === selected.id ? { ...t, status: 'Resolved' } : t));
    try {
      await api.patch(`/tickets/${selected.id}`, { status: 'Resolved' });
      toast.success(`${selected.id} marked as resolved`);
    } catch (err) {
      setTickets(previous);
      toast.error(err instanceof ApiError ? err.message : 'Failed to resolve ticket');
    }
  };

  return (
    <div>
      <PageHeader title="Support Tickets" description="Client support requests and conversations." />

      {loading ?
      <Card><div className="p-5"><TableSkeleton rows={5} /></div></Card> :
      tickets.length === 0 ?
      <Card><EmptyState icon={LifeBuoyIcon} title="No support tickets" description="Tickets will appear here once clients start raising them." /></Card> :

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Ticket list */}
        <Card className="lg:col-span-1">
          <ul className="max-h-[70vh] divide-y divide-border-soft overflow-y-auto dark:divide-slate-800">
            {tickets.map((t) =>
            <li key={t.id}>
                <button
                onClick={() => setSelectedId(t.id)}
                className={cn(
                  'w-full px-4 py-3.5 text-left transition',
                  t.id === selectedId ? 'bg-light-blue/60 dark:bg-teal/10' : 'hover:bg-soft-gray dark:hover:bg-slate-800/50'
                )}>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-400">{t.id}</span>
                    <StatusBadge status={t.priority} dot={false} />
                  </div>
                  <p className="mt-1 line-clamp-1 font-bold text-navy dark:text-slate-100">{t.subject}</p>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-xs text-text-gray dark:text-slate-400">{t.client}</span>
                    <StatusBadge status={t.status} />
                  </div>
                </button>
              </li>
            )}
          </ul>
        </Card>

        {/* Thread */}
        <Card className="flex flex-col lg:col-span-2">
          {selected ?
          <>
              <div className="flex flex-col gap-2 border-b border-border-soft p-5 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-lg font-bold text-navy dark:text-slate-100">{selected.subject}</h3>
                  <p className="text-sm text-text-gray dark:text-slate-400">
                    {selected.id} · {selected.client} · Assigned to {selected.assignee}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={selected.priority} dot={false} />
                  <StatusBadge status={selected.status} />
                </div>
              </div>

              <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto p-5">
                {selected.thread.map((m, i) => {
                const agent = m.role === 'agent';
                return (
                  <div key={i} className={cn('flex gap-3', agent && 'flex-row-reverse')}>
                      <Avatar name={m.author} size="sm" />
                      <div className={cn('max-w-[75%]', agent && 'text-right')}>
                        <div className="mb-1 flex items-center gap-2 text-xs text-text-gray dark:text-slate-400" style={agent ? { flexDirection: 'row-reverse' } : undefined}>
                          <span className="font-bold text-navy dark:text-slate-200">{m.author}</span>
                          <span>{relativeTime(m.time)}</span>
                        </div>
                        <div
                        className={cn(
                          'inline-block rounded-2xl px-4 py-2.5 text-sm',
                          agent ?
                          'bg-griptor-gradient text-white' :
                          'bg-soft-gray text-navy dark:bg-slate-800 dark:text-slate-200'
                        )}>

                          {m.text}
                        </div>
                      </div>
                    </div>);

              })}
              </div>

              <div className="border-t border-border-soft p-4 dark:border-slate-800">
                <Textarea
                placeholder="Type your reply…"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                className="min-h-[72px]" />

                <div className="mt-3 flex items-center justify-between">
                  <Button variant="secondary" onClick={resolve} disabled={selected.status === 'Resolved'}>
                    Mark resolved
                  </Button>
                  <Button onClick={sendReply} disabled={!reply.trim()} loading={sending}>
                    <SendIcon className="h-4 w-4" /> Send reply
                  </Button>
                </div>
              </div>
            </> :

          <EmptyState icon={LifeBuoyIcon} title="Select a ticket" description="Choose a ticket to view the conversation." />
          }
        </Card>
      </div>
      }
    </div>);

}

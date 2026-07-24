import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { StarIcon, MessageSquareIcon, ReplyIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Avatar } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { StatCard } from '../../components/ui/StatCard';
import { EmptyState } from '../../components/ui/EmptyState';
import { Feedback as FeedbackType } from '../../types/feedback';
import { formatDate, cn } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

function Stars({ rating }: {rating: number;}) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) =>
      <StarIcon
        key={i}
        className={cn('h-4 w-4', i < rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300 dark:text-slate-600')} />

      )}
    </div>);

}

export function Feedback() {
  const [items, setItems] = useState<FeedbackType[]>([]);

  useEffect(() => {
    api
      .get<{ feedback: FeedbackType[] }>('/feedback')
      .then(({ feedback }) => setItems(feedback))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load feedback'));
  }, []);

  const avg = items.length > 0 ? (items.reduce((s, f) => s + f.rating, 0) / items.length).toFixed(1) : '—';
  const responded = items.filter((f) => f.responded).length;
  const fiveStar = items.filter((f) => f.rating === 5).length;

  const reply = async (f: FeedbackType) => {
    const previous = items;
    setItems((prev) => prev.map((x) => x.id === f.id ? { ...x, responded: true } : x));
    try {
      await api.patch(`/feedback/${f.id}`, { responded: true });
      toast.success(`Response sent to ${f.customer}`);
    } catch (err) {
      setItems(previous);
      toast.error(err instanceof ApiError ? err.message : 'Failed to send response');
    }
  };

  return (
    <div>
      <PageHeader title="Feedback" description="Reviews and ratings collected after each service." />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Average rating" value={`${avg} ★`} icon={StarIcon} />
        <StatCard label="5-star reviews" value={String(fiveStar)} icon={StarIcon} hint="great work" />
        <StatCard label="Responded" value={`${responded}/${items.length}`} icon={MessageSquareIcon} hint="reply rate" />
      </div>

      {items.length === 0 ?
      <Card><EmptyState icon={MessageSquareIcon} title="No feedback yet" description="Reviews will appear here once customers leave them after a service." /></Card> :

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {items.map((f) =>
        <Card key={f.id} className="p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <Avatar name={f.customer ?? '?'} size="md" />
                <div>
                  <p className="font-bold text-navy dark:text-slate-100">{f.customer}</p>
                  <p className="text-xs text-text-gray dark:text-slate-400">{f.service} · {formatDate(f.date)}</p>
                </div>
              </div>
              <Stars rating={f.rating} />
            </div>
            <p className="mt-3 text-sm text-navy dark:text-slate-200">“{f.comment}”</p>
            <div className="mt-4 flex items-center justify-between border-t border-border-soft pt-3 dark:border-slate-800">
              {f.responded ?
            <Badge tone="green" dot>Responded</Badge> :

            <Badge tone="amber" dot>Awaiting reply</Badge>
            }
              {!f.responded &&
            <Button size="sm" variant="secondary" onClick={() => reply(f)}>
                  <ReplyIcon className="h-3.5 w-3.5" /> Reply
                </Button>
            }
            </div>
          </Card>
        )}
      </div>
      }
    </div>);

}

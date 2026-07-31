import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Booking } from '../../../types/booking';
import { api } from '../../../lib/api';

const POLL_INTERVAL_MS = 30_000;

/**
 * Polls the full (branch-pin-enforced server-side, otherwise unfiltered)
 * booking list every 30s and diffs against previously-seen IDs — deliberately
 * not scoped to whatever filters are currently applied in the table, so a
 * new booking is never missed just because a status/search filter happens to
 * hide it. The page applies its own client-side filtering on top of whatever
 * this reports, same as the initial one-time load already does.
 */
export function useAutoRefresh(onBookings: (bookings: Booking[]) => void) {
  const seenIdsRef = useRef<Set<string> | null>(null); // null = first poll, no diff/toast yet

  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const poll = () => {
      api
        .get<{ bookings: Booking[] }>('/bookings')
        .then(({ bookings }) => {
          const currentIds = new Set(bookings.map((b) => b.id));
          if (seenIdsRef.current) {
            const newOnes = bookings.filter((b) => !seenIdsRef.current!.has(b.id));
            for (const b of newOnes) {
              toast.success(`New booking${b.customer ? ` from ${b.customer}` : ''}${b.source === 'public' ? ' (online)' : ''}`);
              if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                new Notification('New booking', { body: `${b.customer ?? 'A customer'} — ${b.timeSlot}` });
              }
            }
          }
          seenIdsRef.current = currentIds;
          onBookings(bookings);
        })
        .catch(() => {});
    };

    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

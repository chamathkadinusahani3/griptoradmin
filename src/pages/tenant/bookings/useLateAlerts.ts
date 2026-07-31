import { useEffect, useRef, useState } from 'react';
import { Booking } from '../../../types/booking';
import { api } from '../../../lib/api';

export interface LateAlert {
  bookingId: string;
  customerName?: string;
  timeSlot: string;
  minutesLate: number;
  escalated: boolean;
}

const SCAN_INTERVAL_MS = 60_000;
const ALERT_THRESHOLD_MINUTES = 10;
const ESCALATE_THRESHOLD_MINUTES = 30;

function minutesLateFor(booking: Booking, now: number): number | null {
  const todayStr = new Date().toISOString().slice(0, 10);
  if (booking.date.slice(0, 10) !== todayStr) return null;
  const [h, m] = booking.timeSlot.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const slotTime = new Date();
  slotTime.setHours(h, m, 0, 0);
  return Math.floor((now - slotTime.getTime()) / 60_000);
}

/**
 * Scans today's still-Pending bookings every 60s. At >=10 min late, sends a
 * (simulated/real, depending on whether the tenant has SMS configured)
 * customer alert and surfaces a dismissible banner entry; at >=30 min late,
 * escalates the copy and the booking is auto-cancelled server-side
 * (bookings/[id]/late-alert.ts). Dismissal is per-threshold — dismissing the
 * 10-minute alert doesn't suppress the 30-minute escalation for the same
 * booking. All state is in-memory only (matches the "dismissible" = ephemeral
 * framing — nothing here is persisted).
 */
export function useLateAlerts(bookings: Booking[], onBookingUpdated: (booking: Booking) => void) {
  const [alerts, setAlerts] = useState<LateAlert[]>([]);
  const notifiedRef = useRef<{ ten: Set<string>; thirty: Set<string> }>({ ten: new Set(), thirty: new Set() });
  const dismissedRef = useRef<{ ten: Set<string>; thirty: Set<string> }>({ ten: new Set(), thirty: new Set() });

  useEffect(() => {
    const scan = () => {
      const now = Date.now();
      const nextAlerts: LateAlert[] = [];

      for (const b of bookings) {
        if (b.status !== 'Pending') continue;
        const minutesLate = minutesLateFor(b, now);
        if (minutesLate === null || minutesLate < ALERT_THRESHOLD_MINUTES) continue;

        const escalated = minutesLate >= ESCALATE_THRESHOLD_MINUTES;
        const tier = escalated ? 'thirty' : 'ten';

        if (!notifiedRef.current[tier].has(b.id)) {
          notifiedRef.current[tier].add(b.id);
          api
            .post<{ booking: Booking }>(`/bookings/${b.id}/late-alert`, { minutesLate })
            .then(({ booking }) => onBookingUpdated(booking))
            .catch(() => {});
        }

        if (!dismissedRef.current[tier].has(b.id)) {
          nextAlerts.push({ bookingId: b.id, customerName: b.customer, timeSlot: b.timeSlot, minutesLate, escalated });
        }
      }

      setAlerts(nextAlerts);
    };

    scan();
    const interval = setInterval(scan, SCAN_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookings]);

  const dismiss = (alert: LateAlert) => {
    dismissedRef.current[alert.escalated ? 'thirty' : 'ten'].add(alert.bookingId);
    setAlerts((prev) => prev.filter((a) => a.bookingId !== alert.bookingId));
  };

  return { alerts, dismiss };
}

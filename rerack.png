'use client';

import { useEffect, useState } from 'react';

export interface ToastEvent {
  id: string; // unique id (visit id) — used as react key + dedupe
  name: string;
  time: string; // formatted HH:MM:SS
  status: 'approved' | 'denied_banned' | 'denied_age';
}

/**
 * CheckinToast — top-right slide-in notification card for staff/admin
 * dashboard. Shown when a new visit comes in via realtime.
 *
 * Stacks multiple events vertically. Each toast auto-dismisses after 6s.
 * Dismissing a toast manually slides it out.
 */
export default function CheckinToastStack({ events }: { events: ToastEvent[] }) {
  return (
    <div className="checkin-toast-stack" aria-live="polite" aria-atomic="false">
      {events.map((evt) => (
        <ToastCard key={evt.id} event={evt} />
      ))}
    </div>
  );
}

function ToastCard({ event }: { event: ToastEvent }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    // Auto-leave 200ms before parent removes us, so the slide-out animation
    // has time to play visually.
    const t = setTimeout(() => setLeaving(true), 5800);
    return () => clearTimeout(t);
  }, []);

  // Color & label by status
  let badgeBg = 'bg-success';
  let badgeText = '✓ CHECK-IN';
  if (event.status === 'denied_banned') {
    badgeBg = 'bg-danger';
    badgeText = '✕ BANNED';
  } else if (event.status === 'denied_age') {
    badgeBg = 'bg-danger';
    badgeText = '✕ UNDERAGE';
  }

  return (
    <div className={`checkin-toast ${leaving ? 'checkin-toast-leaving' : ''}`}>
      <div className={`${badgeBg} text-white font-display text-[10px] tracking-widest px-2 py-1 inline-block`}>
        {badgeText}
      </div>
      <div className="font-display text-base mt-1.5 truncate">
        {event.name.toUpperCase()}
      </div>
      <div className="font-mono text-[11px] text-neutral-500 mt-0.5">
        {event.time}
      </div>
    </div>
  );
}

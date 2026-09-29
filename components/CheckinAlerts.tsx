'use client';

// v2.20.0 — check-in popup v2. Replaces CheckinToast (v2.7.4).
//
// Mounted once in app/admin/layout.tsx and app/staff/layout.tsx, so it
// works on EVERY dashboard page (the old toast lived inside TodayList and
// only fired while TODAY was open). Front desk mostly doesn't touch the
// dashboard — they rely on this popup — so it is severity-tiered:
//
//   allowed / member  → top-right card, 8 s, "ok" chime
//   warned customer   → yellow card with attention photo + latest warning
//                       reason, 20 s, "warn" chime
//   BANNED            → centre takeover (photo, reason, what to do). Never
//                       auto-closes; alarm repeats every 5 s until someone
//                       presses I'VE HANDLED IT (can be muted); browser tab
//                       title flashes; Windows notification if permitted
//   under 12          → centre card, 15 s or OK, "denied" chime
//
// Acknowledging is local UI only — nothing is written to the database,
// so /staff stays read-only.
//
// Detection: realtime INSERT on visits (debounced) plus a 20 s poll and a
// refresh when the tab becomes visible, all diffing the newest
// todays_visits rows against ids already seen. The first load only
// records what's there, so opening the page never replays old arrivals.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-client';
import { enableAudio, playChime } from '@/lib/chime';
import { calcAge, formatTime, parseICDob } from '@/lib/utils';

const ALERT_COLUMNS =
  'id, visited_at, visit_status, customer_id, ic, visit_ic, name, customer_status, warning_count, ban_reason, banned_at, membership, photo_path, visit_count, last_warning_reason, last_warning_at';

const PHOTO_BUCKET = 'attention-photos';
const SIGNED_URL_TTL = 60 * 60 * 6; // 6 h, same as the Attention page
const TOAST_MS = { ok: 8000, warn: 20000 } as const;
const AGE_MODAL_MS = 15000;
const ALARM_EVERY_MS = 5000;
const MAX_VISIBLE_TOASTS = 3;

interface AlertRow {
  id: string;
  visited_at: string;
  visit_status: 'approved' | 'denied_banned' | 'denied_age';
  customer_id: string | null;
  ic: string | null;
  visit_ic: string | null;
  name: string | null;
  customer_status: 'active' | 'banned' | null;
  warning_count: number | null;
  ban_reason: string | null;
  banned_at: string | null;
  membership: 'member' | null;
  photo_path: string | null;
  visit_count: number | null;
  last_warning_reason: string | null;
  last_warning_at: string | null;
}

type Kind = 'ok' | 'member' | 'warn' | 'banned' | 'age';

interface AlertItem {
  id: string;
  kind: Kind;
  row: AlertRow;
  time: string;
  photoUrl: string | null;
}

function classify(r: AlertRow): Kind {
  if (r.visit_status === 'denied_banned' || r.customer_status === 'banned') return 'banned';
  if (r.visit_status === 'denied_age') return 'age';
  if ((r.warning_count ?? 0) > 0) return 'warn';
  return r.membership === 'member' ? 'member' : 'ok';
}

function displayName(r: AlertRow): string {
  if (r.name) return r.name.toUpperCase();
  return r.visit_status === 'denied_age' ? 'UNDERAGE ATTEMPT' : 'UNKNOWN';
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** "29 SEP" (this year) or "29 SEP 2025", in KL time. */
function shortDate(iso: string | null): string {
  if (!iso) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'Asia/Kuala_Lumpur',
  }).formatToParts(new Date(iso));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const thisYear = Number(
    new Intl.DateTimeFormat('en-CA', { year: 'numeric', timeZone: 'Asia/Kuala_Lumpur' }).format(new Date()),
  );
  const d = `${String(get('day')).padStart(2, '0')} ${MONTHS[get('month') - 1]}`;
  return get('year') === thisYear ? d : `${d} ${get('year')}`;
}

interface CheckinAlertsProps {
  /** TODAY page for this role — target of "+N MORE". */
  todayHref: '/admin' | '/staff';
  customersHref: '/admin/customers' | '/staff/customers';
}

export default function CheckinAlerts({ todayHref, customersHref }: CheckinAlertsProps) {
  const supabase = useMemo(() => createClient(), []);
  const [toasts, setToasts] = useState<AlertItem[]>([]);
  const [modals, setModals] = useState<AlertItem[]>([]);
  const [alarmMuted, setAlarmMuted] = useState(false);

  const seenIds = useRef<Set<string> | null>(null); // null until first load
  const photoCache = useRef<Map<string, string>>(new Map());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  };

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const closeModal = useCallback((id: string) => {
    setModals((prev) => prev.filter((m) => m.id !== id));
    setAlarmMuted(false);
  }, []);

  const signPhoto = useCallback(
    async (path: string | null): Promise<string | null> => {
      if (!path) return null;
      const hit = photoCache.current.get(path);
      if (hit) return hit;
      const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, SIGNED_URL_TTL);
      if (data?.signedUrl) photoCache.current.set(path, data.signedUrl);
      return data?.signedUrl ?? null;
    },
    [supabase],
  );

  const check = useCallback(async () => {
    const { data, error } = await supabase
      .from('todays_visits')
      .select(ALERT_COLUMNS)
      .order('visited_at', { ascending: false })
      .limit(30);
    if (error || !data) return;
    const rows = data as unknown as AlertRow[];

    // First load: remember what's already there, alert on nothing.
    if (seenIds.current === null) {
      seenIds.current = new Set(rows.map((r) => r.id));
      return;
    }
    const fresh = rows.filter((r) => !seenIds.current!.has(r.id)).reverse(); // oldest first
    if (fresh.length === 0) return;
    fresh.forEach((r) => seenIds.current!.add(r.id));

    const items: AlertItem[] = await Promise.all(
      fresh.map(async (r) => {
        const kind = classify(r);
        const wantsPhoto = kind === 'banned' || kind === 'warn';
        return {
          id: r.id,
          kind,
          row: r,
          time: formatTime(r.visited_at),
          photoUrl: wantsPhoto ? await signPhoto(r.photo_path) : null,
        };
      }),
    );

    const newToasts = items.filter((i) => i.kind === 'ok' || i.kind === 'member' || i.kind === 'warn');
    const newModals = items.filter((i) => i.kind === 'banned' || i.kind === 'age');

    if (newToasts.length) {
      setToasts((prev) => [...newToasts.slice().reverse(), ...prev]);
      newToasts.forEach((t) => later(() => removeToast(t.id), t.kind === 'warn' ? TOAST_MS.warn : TOAST_MS.ok));
    }
    if (newModals.length) {
      // Banned first — it's the one that needs a human.
      setModals((prev) =>
        [...prev, ...newModals].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'banned' ? -1 : 1)),
      );
      newModals
        .filter((m) => m.kind === 'age')
        .forEach((m) => later(() => closeModal(m.id), AGE_MODAL_MS));
    }

    // One sound per batch, most severe wins. The banned alarm itself is
    // driven by the effect below.
    if (!items.some((i) => i.kind === 'banned')) {
      if (items.some((i) => i.kind === 'age')) playChime('denied');
      else if (items.some((i) => i.kind === 'warn')) playChime('warn');
      else playChime('ok');
    }

    // Windows notification when the browser isn't in front.
    try {
      if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        newModals.forEach((m) => {
          const title = m.kind === 'banned'
            ? `DO NOT ADMIT — ${displayName(m.row)} (banned)`
            : 'UNDER 12 — entry refused';
          new Notification(title, {
            body: m.kind === 'banned' ? (m.row.ban_reason || 'Banned customer at the door.') : 'Refused automatically.',
            tag: m.id,
            requireInteraction: m.kind === 'banned',
          });
        });
      }
    } catch {
      /* notifications unavailable */
    }
  }, [supabase, signPhoto, removeToast, closeModal]);

  // Realtime + polling fallback + refresh on tab focus.
  useEffect(() => {
    check();
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const trigger = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(check, 300);
    };
    const channel = supabase
      .channel('checkin-alerts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'visits' }, trigger)
      .subscribe();
    const poll = setInterval(check, 20000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisible);
    // Any click on the dashboard unlocks audio for later chimes.
    const unlock = () => enableAudio();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    const pending = timers.current;
    return () => {
      if (debounce) clearTimeout(debounce);
      supabase.removeChannel(channel);
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      pending.forEach(clearTimeout);
    };
  }, [supabase, check]);

  const front = modals[0] ?? null;
  const bannedOpen = front?.kind === 'banned';

  // Repeating alarm + flashing tab title while a banned alert is open.
  useEffect(() => {
    if (!bannedOpen || !front) return;
    const original = document.title;
    const flash = `● BANNED — ${displayName(front.row)}`;
    let on = false;
    const titleTimer = setInterval(() => {
      on = !on;
      document.title = on ? flash : original;
    }, 1000);
    let alarmTimer: ReturnType<typeof setInterval> | null = null;
    if (!alarmMuted) {
      playChime('alarm');
      alarmTimer = setInterval(() => playChime('alarm'), ALARM_EVERY_MS);
    }
    return () => {
      clearInterval(titleTimer);
      if (alarmTimer) clearInterval(alarmTimer);
      document.title = original;
    };
  }, [bannedOpen, front, alarmMuted]);

  const visible = toasts.slice(0, MAX_VISIBLE_TOASTS);
  const hidden = toasts.length - visible.length;

  return (
    <>
      <div className="checkin-stack" aria-live="polite">
        {visible.map((t) => (
          <ToastCard
            key={t.id}
            item={t}
            href={t.row.customer_id ? `${customersHref}/${t.row.customer_id}` : null}
            onClose={() => removeToast(t.id)}
          />
        ))}
        {hidden > 0 && (
          <Link href={todayHref} className="checkin-more">
            +{hidden} MORE CHECK-IN{hidden === 1 ? '' : 'S'} →
          </Link>
        )}
      </div>

      {front && (
        <AlertModal
          key={front.id}
          item={front}
          queued={modals.length - 1}
          alarmMuted={alarmMuted}
          onToggleMute={() => setAlarmMuted((m) => !m)}
          onClose={() => closeModal(front.id)}
          href={front.row.customer_id ? `${customersHref}/${front.row.customer_id}` : null}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */

function PhotoBox({ url, big }: { url: string | null; big?: boolean }) {
  const size = big ? 'w-[190px] h-[230px]' : 'w-[70px] h-[84px]';
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="Attention photo" className={`${size} object-cover flex-shrink-0 bg-neutral-200`} />;
  }
  return (
    <div className={`${size} flex-shrink-0 bg-neutral-200 text-neutral-500 flex flex-col items-center justify-center gap-1`}>
      <svg width={big ? 72 : 32} height={big ? 72 : 32} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
      </svg>
      {big && <span className="font-mono text-[10px] tracking-widest">NO PHOTO</span>}
    </div>
  );
}

function ToastCard({ item, href, onClose }: { item: AlertItem; href: string | null; onClose: () => void }) {
  const r = item.row;
  const warn = item.kind === 'warn';
  const title = warn ? `WARNING ${r.warning_count}/3 · LET IN` : item.kind === 'member' ? 'ALLOWED · MEMBER' : 'ALLOWED';
  const name = displayName(r);

  const body = (
    <div className="flex gap-3.5 px-4 py-3">
      {warn && <PhotoBox url={item.photoUrl} />}
      <div className="min-w-0 flex flex-col gap-1.5">
        <div className="font-display text-xl leading-tight break-words">{name}</div>
        <div className="flex flex-wrap gap-2 font-mono text-[11px] font-bold">
          {item.kind === 'member' && <span className="px-1.5 py-0.5 bg-success-green text-ink">MEMBER</span>}
          {r.visit_count != null && r.visit_count > 0 && (
            <span className="px-1.5 py-0.5 bg-neutral-100">VISIT #{r.visit_count}</span>
          )}
        </div>
        {warn && r.last_warning_reason && (
          <div className="text-[13px] leading-snug">
            <b>Last warning{r.last_warning_at ? ` ${shortDate(r.last_warning_at)}` : ''}:</b> {r.last_warning_reason}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className={`checkin-card ${warn ? 'checkin-card-warn' : ''}`} role="status">
      <div className={`flex items-center justify-between px-3.5 py-2 font-mono text-xs font-bold tracking-[0.15em] ${warn ? 'bg-accent' : 'bg-success-green'} text-ink`}>
        <span>{title}</span>
        <span className="flex items-center gap-2.5">
          {item.time}
          <button
            type="button"
            onClick={onClose}
            aria-label="Dismiss"
            className="w-6 h-6 border border-ink/40 leading-none text-sm hover:bg-ink hover:text-accent"
          >
            ×
          </button>
        </span>
      </div>
      {href ? (
        <Link href={href} className="block hover:bg-yellow-50">
          {body}
        </Link>
      ) : (
        body
      )}
      <div className="h-[5px] bg-neutral-100">
        <div
          className={`checkin-card-bar h-[5px] ${warn ? 'bg-ink' : 'bg-success-green'}`}
          style={{ animationDuration: `${warn ? TOAST_MS.warn : TOAST_MS.ok}ms` }}
        />
      </div>
    </div>
  );
}

function AlertModal({
  item, queued, alarmMuted, onToggleMute, onClose, href,
}: {
  item: AlertItem;
  queued: number;
  alarmMuted: boolean;
  onToggleMute: () => void;
  onClose: () => void;
  href: string | null;
}) {
  const r = item.row;
  const banned = item.kind === 'banned';
  const ic = r.ic || r.visit_ic || '';
  const dob = ic ? parseICDob(ic) : null;
  const age = dob ? calcAge(dob) : null;
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  return (
    <div className="checkin-modal-backdrop">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={banned ? 'Banned customer — do not admit' : 'Under 12 — entry refused'}
        className={`checkin-modal ${banned ? 'checkin-modal-banned' : 'checkin-modal-age'}`}
      >
        <div className="bg-danger text-ink px-6 py-4 flex items-center justify-between gap-4">
          <div className={`font-display leading-none ${banned ? 'text-4xl md:text-5xl' : 'text-3xl'}`}>
            {banned ? 'DO NOT ADMIT' : 'UNDER 12 · REFUSED'}
          </div>
          <div className="font-mono text-sm font-bold tracking-[0.15em] text-right">
            {banned ? 'BANNED' : 'AGE CHECK'}
            <br />
            {item.time}
          </div>
        </div>

        <div className="px-6 py-5 flex gap-6">
          {banned && <PhotoBox url={item.photoUrl} big />}
          <div className="flex-1 min-w-0 flex flex-col gap-3">
            <div className="font-display text-3xl leading-tight break-words">{displayName(r)}</div>
            <div className="font-mono text-[13px] text-neutral-600">
              {ic}
              {banned && r.banned_at ? ` · BANNED SINCE ${shortDate(r.banned_at)}` : ''}
              {!banned && age != null ? ` · AGE ${age}` : ''}
            </div>
            {banned ? (
              <>
                <div className="bg-red-50 px-3.5 py-3 text-base leading-relaxed">
                  <b>Reason:</b> {r.ban_reason || 'No reason recorded.'}
                </div>
                <div className="text-lg font-bold leading-snug">
                  1. Stop the person at the door.
                  <br />
                  2. Call the manager.
                </div>
              </>
            ) : (
              <div className="text-base leading-relaxed">
                Entry refused automatically. A guardian cannot override the 12+ rule.
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-neutral-100 px-6 py-3.5 flex flex-wrap items-center gap-3">
          {banned && (
            <>
              <span className="font-mono text-[11px] font-bold tracking-widest text-red-700">
                {alarmMuted ? 'ALARM MUTED' : 'ALARM REPEATS EVERY 5 SEC'}
              </span>
              <button
                type="button"
                onClick={onToggleMute}
                className="font-mono text-[11px] tracking-widest px-2.5 py-2 border border-neutral-300 hover:border-ink"
              >
                {alarmMuted ? 'UNMUTE' : 'MUTE'}
              </button>
            </>
          )}
          {href && (
            <Link href={href} onClick={onClose} className="font-mono text-[11px] tracking-widest px-2.5 py-2 border border-neutral-300 hover:border-ink">
              PROFILE →
            </Link>
          )}
          {queued > 0 && (
            <span className="font-mono text-[11px] tracking-widest text-neutral-500">+{queued} MORE ALERT{queued === 1 ? '' : 'S'}</span>
          )}
          <div className="flex-1" />
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="font-display text-sm tracking-wider px-6 py-4 bg-ink text-white hover:bg-neutral-800"
          >
            {banned ? "I'VE HANDLED IT" : 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
}

'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-client';
import { formatTime } from '@/lib/utils';
import { playChime } from '@/lib/chime';
import GenderBadge from './GenderBadge';
import CheckinToastStack, { ToastEvent } from './CheckinToast';

interface VisitRow {
  id: string;
  visited_at: string;
  visit_status: 'approved' | 'denied_banned' | 'denied_age';
  customer_id: string;
  ic: string;
  name: string;
  phone: string;
  nationality: string;
  customer_status: 'active' | 'banned';
  warning_count: number;
  ban_reason: string | null;
  membership: 'member' | null;
  gender: 'male' | 'female' | null;
}

interface TodayListProps {
  baseHref: '/staff/customers' | '/admin/customers';
  role: 'staff' | 'admin';
}

export default function TodayList({ baseHref, role }: TodayListProps) {
  // createBrowserClient is a singleton, but memoizing guarantees a stable
  // identity for the useCallback dependency arrays below.
  const supabase = useMemo(() => createClient(), []);
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Toast events currently shown in the top-right corner. Each event
  // auto-removes after 6 seconds (matches CheckinToast's leave timer).
  const [toasts, setToasts] = useState<ToastEvent[]>([]);

  // IDs of newly arrived visit rows that should briefly flash yellow.
  // Auto-cleared after 3 seconds per row.
  const [highlightIds, setHighlightIds] = useState<Set<string>>(new Set());

  // Set of visit IDs we've already seen — used to detect what's NEW on
  // each fetch. Use a ref so it doesn't trigger re-renders.
  const seenIdsRef = useRef<Set<string>>(new Set());
  // Suppress "new" detection on the very first fetch (otherwise opening
  // the page would toast every existing row from earlier in the day).
  const isInitialLoadRef = useRef(true);

  const isAdmin = role === 'admin';

  // Privacy mode — blurs sensitive feed content (names, IC, phone, gender,
  // status, counts) so customers near the counter can't read the screen.
  // Persists across refresh + realtime updates via sessionStorage. The
  // new-checkin toast pop-up is rendered outside the blur wrapper, so it
  // stays readable even while privacy mode is on.
  const [privacy, setPrivacy] = useState(false);

  // Load persisted privacy state on mount (sessionStorage only — resets
  // when the browser tab is fully closed, which is the desired behaviour
  // for a shared counter terminal).
  useEffect(() => {
    try {
      if (sessionStorage.getItem('xf-privacy') === '1') setPrivacy(true);
    } catch {
      /* sessionStorage unavailable (private mode / SSR) — ignore */
    }
  }, []);

  const togglePrivacy = () => {
    setPrivacy((prev) => {
      const next = !prev;
      try {
        sessionStorage.setItem('xf-privacy', next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const fetchVisits = useCallback(async () => {
    // Only select the columns the UI actually uses (smaller payload)
    const { data } = await supabase
      .from('todays_visits')
      .select('id, visited_at, visit_status, customer_id, ic, name, phone, nationality, customer_status, warning_count, ban_reason, membership, gender');
    if (!data) {
      setLoading(false);
      return;
    }

    const rows = data as VisitRow[];

    // Detect newly arrived visits (any row whose id we haven't seen before).
    // Skipped on the very first fetch — those rows aren't "new", they're
    // just history loaded into a fresh page view.
    if (!isInitialLoadRef.current) {
      const newRows = rows.filter((r) => !seenIdsRef.current.has(r.id));
      if (newRows.length > 0) {
        // Push new toast events. Newest first.
        const newEvents: ToastEvent[] = newRows.map((r) => ({
          id: r.id,
          name: r.name || (r.visit_status === 'denied_age' ? 'Underage attempt' : 'Unknown'),
          time: formatTime(r.visited_at),
          status: r.visit_status,
        }));
        setToasts((prev) => [...newEvents, ...prev].slice(0, 4)); // cap at 4 visible

        // Play chime — different sound for OK vs denied. If multiple new
        // events arrive at once, just play once (avoid cacophony).
        const anyApproved = newRows.some((r) => r.visit_status === 'approved');
        playChime(anyApproved ? 'ok' : 'denied');

        // Highlight new rows. Schedule per-row clear after 3s.
        setHighlightIds((prev) => {
          const next = new Set(prev);
          newRows.forEach((r) => next.add(r.id));
          return next;
        });
        newRows.forEach((r) => {
          setTimeout(() => {
            setHighlightIds((prev) => {
              if (!prev.has(r.id)) return prev;
              const next = new Set(prev);
              next.delete(r.id);
              return next;
            });
          }, 3000);
        });

        // Schedule toast removal — 6s from now (matches the toast's own
        // leave animation timer).
        const idsToRemove = new Set(newEvents.map((e) => e.id));
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => !idsToRemove.has(t.id)));
        }, 6000);
      }
    }

    // Update seen-IDs set to current snapshot.
    seenIdsRef.current = new Set(rows.map((r) => r.id));
    isInitialLoadRef.current = false;

    setVisits(rows);
    setLoading(false);
    // Reads only refs + setters, so this callback is stable for the
    // lifetime of the component (supabase is memoized above).
  }, [supabase]);

  useEffect(() => {
    fetchVisits();

    // Debounce realtime fetches: if multiple events arrive within 500ms,
    // only fetch once. Avoids hammering the DB during burst inserts.
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedFetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        fetchVisits();
        debounceTimer = null;
      }, 500);
    };

    const channel = supabase
      .channel('today-visits')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'visits' },
        debouncedFetch
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'customers' },
        debouncedFetch
      )
      .subscribe();

    // Polling fallback (in case realtime drops). 60s instead of 30s
    // since realtime should handle most updates.
    const interval = setInterval(fetchVisits, 60000);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchVisits]);

  // Stable identity so memoized VisitRowItem doesn't re-render when
  // unrelated state (toasts, privacy, highlights) changes.
  const handleDeleteVisit = useCallback(
    async (e: React.MouseEvent, visitId: string, visitTime: string, visitName: string) => {
      e.preventDefault();
      e.stopPropagation();
      if (!confirm(`Delete visit by ${visitName} at ${formatTime(visitTime)}?`)) return;
      const { error } = await supabase.from('visits').delete().eq('id', visitId);
      if (error) {
        alert('Delete failed: ' + error.message);
        return;
      }
      await fetchVisits();
    },
    [supabase, fetchVisits],
  );

  const stats = {
    total: visits.length,
    approved: visits.filter((v) => v.visit_status === 'approved').length,
    denied: visits.filter((v) => v.visit_status !== 'approved').length,
  };

  return (
    <div className="dashboard-light min-h-screen">
      <div className="bg-white border-b border-neutral-200 px-4 md:px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="font-mono text-[10px] tracking-[0.3em] text-neutral-500 mb-1">
              // LIVE FEED
            </p>
            <h1 className="font-display text-3xl md:text-4xl tracking-tight">TODAY</h1>
            <p className="font-mono text-xs text-neutral-600 mt-1">
              <span className="inline-block w-1.5 h-1.5 bg-success rounded-full mr-1.5 animate-pulse-slow align-middle" />
              <LiveClock />
            </p>
          </div>
          <div className="flex gap-3 items-center">
            <button
              onClick={togglePrivacy}
              className={`w-11 h-11 rounded-full grid place-items-center text-xl leading-none border-2 transition-colors flex-shrink-0 ${
                privacy
                  ? 'bg-ink border-ink'
                  : 'bg-neutral-50 border-neutral-200 hover:border-neutral-400'
              }`}
              title={privacy ? 'Privacy ON — tap to show' : 'Privacy OFF — tap to hide'}
              aria-pressed={privacy}
            >
              <span>{privacy ? '🙈' : '👁️'}</span>
            </button>
            <div className={`flex gap-3 ${privacy ? 'privacy-blur' : ''}`}>
              <Stat label="TOTAL" value={stats.total} />
              <Stat label="OK" value={stats.approved} color="green" />
              <Stat label="DENIED" value={stats.denied} color="red" />
            </div>
          </div>
        </div>
      </div>

      {/* Column headers (desktop) */}
      <div className="hidden md:grid bg-ink text-accent px-6 py-2 font-mono text-[10px] tracking-[0.15em] sticky top-[60px] z-10"
        style={{ gridTemplateColumns: isAdmin ? '90px 1fr 200px 180px 100px 50px' : '90px 1fr 200px 180px 100px' }}>
        <div>TIME</div>
        <div>NAME</div>
        <div>IC / PASSPORT</div>
        <div>PHONE</div>
        <div className="text-center">STATUS</div>
        {isAdmin && <div className="text-center">DEL</div>}
      </div>

      {loading ? (
        <div className="text-center py-16 font-mono text-neutral-500">Loading...</div>
      ) : visits.length === 0 ? (
        <div className="text-center py-20">
          <p className="font-display text-2xl mb-2 text-neutral-700">NO CHECK-INS YET</p>
          <p className="font-mono text-xs text-neutral-500">Waiting for first walk-in of the day</p>
        </div>
      ) : (
        /* Privacy mode: ONE blur layer on the whole feed instead of a
           separate 8px blur per cell (was 400+ GPU layers on a busy day).
           The toast stack below is outside this wrapper, so it stays
           readable while privacy is on — same behaviour as before. */
        <div className={privacy ? 'privacy-blur' : ''}>
          {visits.map((v) => (
            <VisitRowItem
              key={v.id}
              visit={v}
              baseHref={baseHref}
              isAdmin={isAdmin}
              onDelete={handleDeleteVisit}
              isHighlighted={highlightIds.has(v.id)}
            />
          ))}
        </div>
      )}

      {/* Top-right toast notifications for new check-ins */}
      <CheckinToastStack events={toasts} />
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: 'green' | 'red' }) {
  const colorClass = color === 'green' ? 'text-success' : color === 'red' ? 'text-danger' : '';
  return (
    <div className="text-center">
      <div className="font-mono text-[10px] tracking-widest text-neutral-500">{label}</div>
      <div className={`font-display text-2xl md:text-3xl ${colorClass}`}>{value}</div>
    </div>
  );
}

/**
 * Self-contained live clock (v2.15.0). Previously the per-second tick
 * lived in TodayList's own state, which re-rendered the ENTIRE feed
 * (all rows) every single second, all day long on the counter PC.
 * Isolating it here means only this tiny text node updates each second.
 */
function LiveClock() {
  const [now, setNow] = useState('');
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const date = d.toLocaleDateString('en-MY', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Kuala_Lumpur',
      });
      setNow(`${date} · ${formatTime(d)}`);
    };
    tick();
    const i = setInterval(tick, 1000);
    return () => clearInterval(i);
  }, []);
  return <>{now}</>;
}

/**
 * One row of the live feed. Memoized: rows only re-render when their own
 * visit data, highlight state, or the (stable) delete handler changes —
 * not when toasts appear, privacy toggles, or the clock ticks.
 */
const VisitRowItem = memo(function VisitRowItem({
  visit, baseHref, isAdmin, onDelete, isHighlighted,
}: {
  visit: VisitRow;
  baseHref: string;
  isAdmin: boolean;
  onDelete: (e: React.MouseEvent, id: string, time: string, name: string) => void;
  isHighlighted: boolean;
}) {
  const time = formatTime(visit.visited_at);
  const isBanned = visit.visit_status === 'denied_banned' || visit.customer_status === 'banned';
  const isDeniedAge = visit.visit_status === 'denied_age';
  const hasWarnings = visit.warning_count > 0 && visit.customer_status !== 'banned';

  let bgClass = 'bg-white hover:bg-yellow-50';
  let statusLabel = '✓ OK';
  let statusClass = 'bg-success text-white';
  let nameDisplay = visit.name?.toUpperCase() || (isDeniedAge ? 'UNDERAGE ATTEMPT' : 'UNKNOWN');

  if (isBanned) {
    bgClass = 'bg-red-50 hover:bg-red-100';
    statusLabel = '✕ BANNED';
    statusClass = 'bg-danger text-white animate-flash-danger';
  } else if (isDeniedAge) {
    bgClass = 'bg-red-50 hover:bg-red-100';
    statusLabel = '✕ AGE';
    statusClass = 'bg-danger text-white';
  } else if (hasWarnings) {
    bgClass = 'bg-yellow-50 hover:bg-yellow-100';
    statusLabel = `⚠ ${visit.warning_count}/3`;
    statusClass = 'bg-accent text-ink';
  }

  const gridCols = isAdmin ? '90px 1fr 200px 180px 100px 50px' : '90px 1fr 200px 180px 100px';

  // Orphaned visits (e.g. underage attempts with no customer record) get
  // no clickable link, but otherwise render with the same layout as
  // regular rows so mobile stacking still works.
  const hasLink = !!visit.customer_id;
  const customerHref = hasLink ? `${baseHref}/${visit.customer_id}` : null;

  // Mobile and desktop layouts are wrapped in <div>s; clickable cells are
  // turned into <Link> only when we have a customer_id.
  // Using a plain wrapper <div> (instead of toggling the outer element
  // between Link/div) keeps the delete button working in admin mode and
  // matches HistoryClient's unified-row pattern.

  return (
    <div
      className={`md:grid flex flex-col gap-1 items-center px-4 md:px-6 py-2.5 border-b border-neutral-200 transition-colors ${bgClass} ${isHighlighted ? 'visit-row-new' : ''}`}
      style={{ gridTemplateColumns: gridCols }}
    >
      {/* Mobile: stacked layout */}
      <div className="md:hidden w-full">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-bold">{time}</span>
            <span className={`font-display text-[10px] tracking-widest px-2 py-0.5 ${statusClass}`}>
              {statusLabel}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                onClick={(e) => onDelete(e, visit.id, visit.visited_at, nameDisplay)}
                className="text-danger text-base"
                title="Delete this visit"
              >
                🗑
              </button>
            )}
            {hasLink && <span className="text-xs text-neutral-400">→</span>}
          </div>
        </div>
        {hasLink ? (
          <Link href={customerHref!} className="block">
            <div className="font-bold text-sm truncate flex items-center gap-1.5">
              {visit.membership === 'member' && (
                <span className="font-display text-[9px] tracking-widest px-1.5 py-0.5 bg-success-green text-white flex-shrink-0">⭐</span>
              )}
              <GenderBadge gender={visit.gender} />
              <span className="truncate">{nameDisplay}</span>
            </div>
            <div className="font-mono text-[11px] text-neutral-600 truncate">
              {visit.ic} · {visit.phone || '—'}
            </div>
          </Link>
        ) : (
          <>
            <div className="font-bold text-sm truncate">{nameDisplay}</div>
            <div className="font-mono text-[11px] text-neutral-600 truncate">
              {visit.ic} · —
            </div>
          </>
        )}
      </div>

      {/* Desktop: table layout */}
      {hasLink ? (
        <>
          <Link href={customerHref!} className="hidden md:block font-mono text-sm font-bold">{time}</Link>
          <Link href={customerHref!} className="hidden md:flex items-center gap-1.5 font-bold text-sm truncate">
            {visit.membership === 'member' && (
              <span className="font-display text-[9px] tracking-widest px-1.5 py-0.5 bg-success-green text-white flex-shrink-0">⭐ MEMBER</span>
            )}
            <GenderBadge gender={visit.gender} />
            <span className="truncate">{nameDisplay}</span>
          </Link>
          <Link href={customerHref!} className="hidden md:block font-mono text-xs text-neutral-600 truncate">
            {visit.nationality === 'foreigner' && <span className="text-accent mr-1">🌍</span>}
            {visit.ic}
          </Link>
          <Link href={customerHref!} className="hidden md:block font-mono text-xs text-neutral-600 truncate">
            {visit.phone || '—'}
          </Link>
          <Link href={customerHref!} className="hidden md:block text-center">
            <span className={`font-display text-[10px] tracking-widest px-2 py-1 ${statusClass}`}>
              {statusLabel}
            </span>
          </Link>
        </>
      ) : (
        <>
          <div className="hidden md:block font-mono text-sm font-bold">{time}</div>
          <div className="hidden md:block font-bold text-sm truncate">{nameDisplay}</div>
          <div className="hidden md:block font-mono text-xs text-neutral-600 truncate">{visit.ic}</div>
          <div className="hidden md:block font-mono text-xs text-neutral-600">—</div>
          <div className="hidden md:block text-center">
            <span className={`font-display text-[10px] tracking-widest px-2 py-1 ${statusClass}`}>
              {statusLabel}
            </span>
          </div>
        </>
      )}
      {isAdmin && (
        <div className="hidden md:flex justify-center">
          <button
            onClick={(e) => onDelete(e, visit.id, visit.visited_at, nameDisplay)}
            className="text-danger hover:scale-125 transition-transform text-base"
            title="Delete this visit record"
          >
            🗑
          </button>
        </div>
      )}
    </div>
  );
});

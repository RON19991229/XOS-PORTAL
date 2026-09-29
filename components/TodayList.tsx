'use client';

// v2.22.0 — TODAY in the "A · Control Room (light)" layout:
//   KPI strip (check-ins / allowed / denied hidden while privacy is on;
//   LAST CHECK-IN always visible) → live feed → right column with
//   NEEDS ATTENTION, or the customer panel when a row is clicked.
// Data flow is unchanged from v2.19/v2.20: todays_visits view, realtime +
// 60s poll, in-tab cache, yellow flash on new rows. The popup lives in
// CheckinAlerts (layout).

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import { formatTime, parseTimestamp, calcAge, parseICDob } from '@/lib/utils';
import { getCached, setCached } from '@/lib/client-cache';
import { PrivateNum, usePrivacy } from '@/lib/privacy';
import { useDashboard } from './dashboard/DashboardShell';
import { CustomerPanel, PanelSeed, SideColumn } from './dashboard/CustomerPanel';
import GenderBadge from './GenderBadge';

interface VisitRow {
  id: string;
  visited_at: string;
  visit_status: 'approved' | 'denied_banned' | 'denied_age';
  customer_id: string | null;
  ic: string;
  name: string | null;
  phone: string | null;
  nationality: string | null;
  customer_status: 'active' | 'banned' | null;
  warning_count: number | null;
  ban_reason: string | null;
  membership: 'member' | null;
  gender: 'male' | 'female' | null;
  visit_count: number | null;
  last_warning_reason: string | null;
}

const VISIT_COLUMNS =
  'id, visited_at, visit_status, customer_id, ic, name, phone, nationality, customer_status, warning_count, ban_reason, membership, gender, visit_count, last_warning_reason';
const CACHE_KEY = 'today:visits';

// BY HOUR chart covers 6am–11pm (KL time).
const FIRST_HOUR = 6;
const LAST_HOUR = 23;
const KL_HOUR_FMT = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Kuala_Lumpur' });

type Kind = 'ok' | 'warn' | 'banned' | 'age';

function kindOf(v: VisitRow): Kind {
  if (v.visit_status === 'denied_banned' || v.customer_status === 'banned') return 'banned';
  if (v.visit_status === 'denied_age') return 'age';
  if ((v.warning_count ?? 0) > 0) return 'warn';
  return 'ok';
}

const ROW_BG: Record<Kind, string> = {
  ok: 'bg-white',
  warn: 'bg-[#fffbe6]',
  banned: 'bg-[#fff1f0]',
  age: 'bg-[#fff6f5]',
};

interface TodayListProps {
  baseHref: '/staff/customers' | '/admin/customers';
  role: 'staff' | 'admin';
}

export default function TodayList({ baseHref, role }: TodayListProps) {
  // createBrowserClient is a singleton, but memoizing guarantees a stable
  // identity for the useCallback dependency arrays below.
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { newComplaints, base } = useDashboard();
  // v2.19.0: show the last-seen feed instantly when navigating back to
  // TODAY; fetchVisits() below refreshes it straight away.
  const [visits, setVisits] = useState<VisitRow[]>(() => getCached<VisitRow[]>(CACHE_KEY) ?? []);
  const [loading, setLoading] = useState(() => !getCached<VisitRow[]>(CACHE_KEY));
  const [selected, setSelected] = useState<PanelSeed | null>(null);

  // IDs of newly arrived visit rows that should briefly flash yellow.
  // Auto-cleared after 3 seconds per row.
  const [highlightIds, setHighlightIds] = useState<Set<string>>(new Set());

  // Set of visit IDs we've already seen — used to detect what's NEW on
  // each fetch. Use a ref so it doesn't trigger re-renders.
  const seenIdsRef = useRef<Set<string>>(new Set());
  // Suppress "new" detection on the very first fetch (otherwise opening
  // the page would flash every existing row from earlier in the day).
  const isInitialLoadRef = useRef(true);

  const isAdmin = role === 'admin';

  const fetchVisits = useCallback(async () => {
    const { data } = await supabase.from('todays_visits').select(VISIT_COLUMNS);
    if (!data) {
      setLoading(false);
      return;
    }

    const rows = data as VisitRow[];

    // Detect newly arrived visits (skipped on the very first fetch — those
    // rows aren't "new", they're just history loaded into a fresh view).
    if (!isInitialLoadRef.current) {
      const newRows = rows.filter((r) => !seenIdsRef.current.has(r.id));
      if (newRows.length > 0) {
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
      }
    }

    seenIdsRef.current = new Set(rows.map((r) => r.id));
    isInitialLoadRef.current = false;

    setVisits(rows);
    setCached(CACHE_KEY, rows);
    setLoading(false);
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visits' }, debouncedFetch)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'customers' }, debouncedFetch)
      .subscribe();

    // Polling fallback (in case realtime drops).
    const interval = setInterval(fetchVisits, 60000);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [fetchVisits, supabase]);

  // Stable identity so memoized rows don't re-render when unrelated state
  // (highlights, selection elsewhere) changes.
  const handleDeleteVisit = useCallback(
    async (visitId: string, visitTime: string, visitName: string) => {
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

  // Desktop: open the side panel. Phone: go straight to the profile.
  const handleOpen = useCallback(
    (v: VisitRow) => {
      if (!v.customer_id) return;
      if (window.matchMedia('(min-width: 768px)').matches) {
        setSelected((cur) =>
          cur?.id === v.customer_id
            ? null
            : {
                id: v.customer_id!,
                name: v.name ?? '',
                ic: v.ic,
                phone: v.phone,
                nationality: v.nationality,
                status: v.customer_status,
                warning_count: v.warning_count,
                ban_reason: v.ban_reason,
                membership: v.membership,
                visit_count: v.visit_count,
              },
        );
      } else {
        router.push(`${baseHref}/${v.customer_id}`);
      }
    },
    [baseHref, router],
  );

  const stats = useMemo(() => {
    const denied = visits.filter((v) => v.visit_status !== 'approved').length;
    const hours = new Array(LAST_HOUR - FIRST_HOUR + 1).fill(0) as number[];
    for (const v of visits) {
      const d = parseTimestamp(v.visited_at);
      if (!d) continue;
      const h = parseInt(KL_HOUR_FMT.format(d), 10) % 24;
      if (h >= FIRST_HOUR && h <= LAST_HOUR) hours[h - FIRST_HOUR] += 1;
    }
    return { total: visits.length, approved: visits.length - denied, denied, hours };
  }, [visits]);

  // Rows come newest-first from the view; sort defensively anyway.
  const latestAt = useMemo(() => {
    let max = 0;
    for (const v of visits) {
      const t = parseTimestamp(v.visited_at)?.getTime() ?? 0;
      if (t > max) max = t;
    }
    return max || null;
  }, [visits]);

  const gridCols = isAdmin
    ? '80px minmax(0,1fr) 180px 170px 112px 44px'
    : '80px minmax(0,1fr) 180px 170px 112px';

  return (
    <div>
      {/* ---- KPI strip ---- */}
      <section className="grid grid-cols-3 xl:grid-cols-5 gap-2 md:gap-3 px-4 md:px-6 py-3 md:py-4 border-b border-line">
        <Kpi label="CHECK-INS TODAY">
          <PrivateNum value={stats.total} />
        </Kpi>
        <Kpi label="ALLOWED">
          <PrivateNum value={stats.approved} className="text-success-green" />
        </Kpi>
        <Kpi label="DENIED">
          <PrivateNum value={stats.denied} className="text-danger" />
        </Kpi>
        <LastCheckinKpi latestAt={latestAt} />
        <HourBars hours={stats.hours} />
      </section>

      <div className="flex items-start">
        {/* ---- Live feed ---- */}
        <section className="flex-1 min-w-0 bg-white min-h-[calc(100vh-12rem)]">
          <div
            className="hidden md:grid gap-3 bg-ink text-accent px-6 py-2.5 font-mono text-[10px] font-bold tracking-[0.18em] sticky top-16 z-10"
            style={{ gridTemplateColumns: gridCols }}
          >
            <div>TIME</div>
            <div>NAME</div>
            <div>IC / PASSPORT</div>
            <div>PHONE</div>
            <div className="text-center">STATUS</div>
            {isAdmin && <div className="text-center">DEL</div>}
          </div>

          {loading ? (
            <div className="text-center py-16 font-mono text-muted">Loading...</div>
          ) : visits.length === 0 ? (
            <div className="text-center py-20">
              <p className="font-display text-2xl mb-2 text-neutral-700">NO CHECK-INS YET</p>
              <p className="font-mono text-xs text-muted">Waiting for first walk-in of the day</p>
            </div>
          ) : (
            visits.map((v) => (
              <VisitRowItem
                key={v.id}
                visit={v}
                gridCols={gridCols}
                isAdmin={isAdmin}
                onOpen={handleOpen}
                onDelete={handleDeleteVisit}
                isHighlighted={highlightIds.has(v.id)}
                isSelected={!!v.customer_id && selected?.id === v.customer_id}
              />
            ))
          )}
        </section>

        {/* ---- Right column ---- */}
        <SideColumn open={!!selected} onClose={() => setSelected(null)}>
          {selected ? (
            <CustomerPanel seed={selected} baseHref={baseHref} onClose={() => setSelected(null)} />
          ) : (
            <NeedsAttention visits={visits} newComplaints={newComplaints} complaintHref={`${base}/complaint`} onOpen={handleOpen} />
          )}
        </SideColumn>
      </div>
    </div>
  );
}

function Kpi({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white border border-line px-3 md:px-4 py-3 md:py-3.5 min-h-[76px] md:min-h-[92px] ${className}`}>
      <p className="font-mono text-[10px] tracking-[0.2em] text-muted">{label}</p>
      <p className="font-display text-[26px] md:text-[38px] leading-[1.15] mt-1">{children}</p>
    </div>
  );
}

/** Always visible (even with privacy on): shows staff that people are coming in. */
function LastCheckinKpi({ latestAt }: { latestAt: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(i);
  }, []);
  // Refresh "ago" immediately when a new check-in arrives.
  useEffect(() => setNow(Date.now()), [latestAt]);

  let text = '—';
  if (latestAt) {
    const mins = Math.max(0, Math.floor((now - latestAt) / 60000));
    text = mins < 1 ? 'JUST NOW' : mins < 60 ? `${mins} MIN AGO` : `${Math.floor(mins / 60)} H AGO`;
  }
  return (
    <div className="bg-white border border-ink shadow-[inset_4px_0_0_#FFD60A] px-3 md:px-4 py-3 md:py-3.5 min-h-[76px] md:min-h-[92px] col-span-3 xl:col-span-1">
      <p className="font-mono text-[10px] tracking-[0.2em] text-muted">
        LAST CHECK-IN{latestAt ? ` · ${formatTime(new Date(latestAt))}` : ''}
      </p>
      <p className="font-display text-[22px] md:text-[28px] leading-[1.4] md:leading-[1.5] mt-1">{text}</p>
    </div>
  );
}

function HourBars({ hours }: { hours: number[] }) {
  const { privacy } = usePrivacy();
  const max = Math.max(1, ...hours);
  const peak = hours.indexOf(Math.max(...hours));
  return (
    <div className="hidden xl:block bg-white border border-line px-4 py-3.5 min-h-[92px]">
      <p className="font-mono text-[10px] tracking-[0.2em] text-muted">BY HOUR · 6AM–11PM</p>
      {privacy ? (
        <p className="font-display text-[38px] leading-[1.15] mt-1 privacy-dots">•••</p>
      ) : (
        <div className="flex items-end gap-[3px] h-11 mt-2">
          {hours.map((n, i) => (
            <div
              key={i}
              title={`${FIRST_HOUR + i}:00 · ${n}`}
              className={`flex-1 ${n > 0 && i === peak ? 'bg-ink' : 'bg-[#d9d9d3]'}`}
              style={{ height: `${Math.max(n > 0 ? 6 : 2, Math.round((n / max) * 100))}%` }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NeedsAttention({
  visits, newComplaints, complaintHref, onOpen,
}: {
  visits: VisitRow[];
  newComplaints: number;
  complaintHref: string;
  onOpen: (v: VisitRow) => void;
}) {
  // One card per person (latest visit), banned first, then under-12, then warnings.
  const items = useMemo(() => {
    const seen = new Set<string>();
    const out: { v: VisitRow; kind: Kind }[] = [];
    for (const v of visits) {
      const kind = kindOf(v);
      if (kind === 'ok') continue;
      const key = v.customer_id ?? `ic:${v.ic}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ v, kind });
    }
    const order: Record<Kind, number> = { banned: 0, age: 1, warn: 2, ok: 3 };
    return out.sort((a, b) => order[a.kind] - order[b.kind]);
  }, [visits]);

  const count = items.length + (newComplaints > 0 ? 1 : 0);

  return (
    <div>
      <p className="font-mono text-[10px] tracking-[0.25em] text-muted px-5 pt-5 pb-2.5">NEEDS ATTENTION · {count}</p>
      <div className="flex flex-col gap-2.5 px-4 pb-4">
        {count === 0 && (
          <div className="bg-white border border-line p-4 text-sm text-muted">All clear — nothing needs attention today.</div>
        )}
        {items.map(({ v, kind }) => {
          const conf =
            kind === 'banned'
              ? { tag: 'BANNED — DO NOT ADMIT', color: '#ff3b30', text: 'text-danger', desc: v.ban_reason || 'Banned customer attempted to enter.' }
              : kind === 'age'
              ? { tag: 'UNDER 12 REFUSED', color: '#ff3b30', text: 'text-danger', desc: underAgeText(v.ic) }
              : { tag: `WARNING ${v.warning_count ?? 0}/3`, color: '#FFD60A', text: 'text-[#8a6d00]', desc: v.last_warning_reason || 'Has active warnings.' };
          const clickable = !!v.customer_id;
          const Tag = clickable ? 'button' : 'div';
          return (
            <Tag
              key={v.id}
              {...(clickable ? { type: 'button' as const, onClick: () => onOpen(v) } : {})}
              className={`w-full text-left bg-white border border-line p-3.5 flex flex-col gap-1.5 ${clickable ? 'hover:border-ink cursor-pointer' : ''}`}
              style={{ boxShadow: `inset 4px 0 0 ${conf.color}` }}
            >
              <span className="flex justify-between gap-2">
                <span className={`font-mono text-[10px] font-bold tracking-[0.15em] ${conf.text}`}>{conf.tag}</span>
                <span className="font-mono text-[11px] text-muted">{formatTime(v.visited_at)}</span>
              </span>
              <span className="font-bold text-[15px]">
                {kind === 'age' && !v.name ? 'Underage attempt' : <span className="sens">{(v.name ?? 'UNKNOWN').toUpperCase()}</span>}
              </span>
              <span className="text-[13px] text-muted leading-snug">{conf.desc}</span>
            </Tag>
          );
        })}
        {newComplaints > 0 && (
          <Link
            href={complaintHref}
            className="bg-white border border-line p-3.5 flex flex-col gap-1.5 hover:border-ink"
            style={{ boxShadow: 'inset 4px 0 0 #0a0a0a' }}
          >
            <span className="font-mono text-[10px] font-bold tracking-[0.15em]">
              {newComplaints} NEW COMPLAINT{newComplaints === 1 ? '' : 'S'}
            </span>
            <span className="text-[13px] text-muted">Open COMPLAINT to review →</span>
          </Link>
        )}
      </div>
    </div>
  );
}

function underAgeText(ic: string): string {
  const age = calcAge(parseICDob(ic));
  return age >= 0 ? `IC shows age ${age}. Refused automatically.` : 'Refused automatically.';
}

/**
 * One row of the live feed. Memoized: rows only re-render when their own
 * visit data, highlight or selection changes — not when the clock ticks,
 * privacy toggles (pure CSS) or other rows change.
 */
const VisitRowItem = memo(function VisitRowItem({
  visit, gridCols, isAdmin, onOpen, onDelete, isHighlighted, isSelected,
}: {
  visit: VisitRow;
  gridCols: string;
  isAdmin: boolean;
  onOpen: (v: VisitRow) => void;
  onDelete: (id: string, time: string, name: string) => void;
  isHighlighted: boolean;
  isSelected: boolean;
}) {
  const time = formatTime(visit.visited_at);
  const kind = kindOf(visit);
  const nameDisplay = visit.name?.toUpperCase() || (kind === 'age' ? 'UNDERAGE ATTEMPT' : 'UNKNOWN');
  const clickable = !!visit.customer_id;

  const del = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(visit.id, visit.visited_at, nameDisplay);
  };

  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? () => onOpen(visit) : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter') onOpen(visit); } : undefined}
      className={`md:grid flex flex-col gap-1 md:gap-3 items-center px-4 md:px-6 py-2.5 min-h-[54px] border-b border-line transition-colors ${ROW_BG[kind]} ${
        clickable ? 'cursor-pointer hover:bg-[#fffbe0]' : ''
      } ${isSelected ? 'shadow-[inset_4px_0_0_#0a0a0a]' : ''} ${isHighlighted ? 'visit-row-new' : ''}`}
      style={{ gridTemplateColumns: gridCols }}
    >
      {/* Mobile: stacked layout */}
      <div className="md:hidden w-full">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-bold">{time}</span>
            <StatusPill visit={visit} kind={kind} />
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button onClick={del} className="text-danger text-base" title="Delete this visit">
                🗑
              </button>
            )}
            {clickable && <span className="text-xs text-neutral-400">→</span>}
          </div>
        </div>
        <div className="font-bold text-sm truncate flex items-center gap-1.5">
          {visit.membership === 'member' && <MemberTag />}
          <GenderBadge gender={visit.gender} />
          <span className="sens truncate">{nameDisplay}</span>
        </div>
        <div className="sens font-mono text-[11px] text-muted truncate">
          {visit.ic} · {visit.phone || '—'}
        </div>
      </div>

      {/* Desktop: table layout */}
      <div className="hidden md:block font-mono text-sm font-bold">{time}</div>
      <div className="hidden md:flex items-center gap-2 font-bold text-sm min-w-0">
        {visit.membership === 'member' && <MemberTag />}
        <GenderBadge gender={visit.gender} />
        <span className="sens truncate">{nameDisplay}</span>
      </div>
      <div className="hidden md:block font-mono text-xs text-muted truncate">
        {visit.nationality === 'foreigner' && <span className="mr-1">🌍</span>}
        <span className="sens">{visit.ic}</span>
      </div>
      <div className="hidden md:block font-mono text-xs text-muted truncate">
        <span className="sens">{visit.phone || '—'}</span>
      </div>
      <div className="hidden md:block text-center">
        <StatusPill visit={visit} kind={kind} />
      </div>
      {isAdmin && (
        <div className="hidden md:flex justify-center">
          <button
            onClick={del}
            className="w-8 h-8 grid place-items-center border border-transparent hover:border-danger text-danger text-sm"
            title="Delete this visit record"
          >
            🗑
          </button>
        </div>
      )}
    </div>
  );
});

function MemberTag() {
  return (
    <span className="font-mono text-[9px] font-bold tracking-[0.12em] px-1.5 py-0.5 bg-success-green text-ink flex-shrink-0">
      MEMBER
    </span>
  );
}

function StatusPill({ visit, kind }: { visit: VisitRow; kind: Kind }) {
  const conf =
    kind === 'banned'
      ? { label: 'BANNED', cls: 'bg-danger text-white animate-flash-danger' }
      : kind === 'age'
      ? { label: 'UNDER 12', cls: 'bg-danger text-white' }
      : kind === 'warn'
      ? { label: `WARN ${visit.warning_count}/3`, cls: 'bg-accent text-ink' }
      : { label: 'ALLOWED', cls: 'bg-success-green text-ink' };
  return (
    <span className={`inline-block font-mono text-[10px] font-bold tracking-[0.12em] px-2 py-1 ${conf.cls}`}>
      {conf.label}
    </span>
  );
}

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-client';
import { formatTime } from '@/lib/utils';

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
}

interface TodayListProps {
  baseHref: '/staff/customers' | '/admin/customers';
  role: 'staff' | 'admin';
}

export default function TodayList({ baseHref, role }: TodayListProps) {
  const supabase = createClient();
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState('');

  const isAdmin = role === 'admin';

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

  const fetchVisits = async () => {
    // Only select the columns the UI actually uses (smaller payload)
    const { data } = await supabase
      .from('todays_visits')
      .select('id, visited_at, visit_status, customer_id, ic, name, phone, nationality, customer_status, warning_count, ban_reason, membership');
    if (data) setVisits(data as VisitRow[]);
    setLoading(false);
  };

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
  }, []);

  const handleDeleteVisit = async (e: React.MouseEvent, visitId: string, visitTime: string, visitName: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete visit by ${visitName} at ${formatTime(visitTime)}?`)) return;
    const { error } = await supabase.from('visits').delete().eq('id', visitId);
    if (error) {
      alert('Delete failed: ' + error.message);
      return;
    }
    await fetchVisits();
  };

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
              {now}
            </p>
          </div>
          <div className="flex gap-3">
            <Stat label="TOTAL" value={stats.total} />
            <Stat label="OK" value={stats.approved} color="green" />
            <Stat label="DENIED" value={stats.denied} color="red" />
          </div>
        </div>
      </div>

      {/* Column headers (desktop) */}
      <div className={`hidden md:grid bg-ink text-accent px-6 py-2 font-mono text-[10px] tracking-[0.15em] sticky top-[60px] z-10`}
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
        <div>
          {visits.map((v) => (
            <VisitRow
              key={v.id}
              visit={v}
              baseHref={baseHref}
              isAdmin={isAdmin}
              onDelete={handleDeleteVisit}
            />
          ))}
        </div>
      )}
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

function VisitRow({
  visit, baseHref, isAdmin, onDelete,
}: {
  visit: VisitRow;
  baseHref: string;
  isAdmin: boolean;
  onDelete: (e: React.MouseEvent, id: string, time: string, name: string) => void;
}) {
  const time = formatTime(visit.visited_at);
  const isBanned = visit.visit_status === 'denied_banned' || visit.customer_status === 'banned';
  const isDeniedAge = visit.visit_status === 'denied_age';
  const hasWarnings = visit.warning_count > 0 && visit.customer_status !== 'banned';

  let bgClass = 'bg-white hover:bg-yellow-50';
  let statusLabel = '✓ OK';
  let statusClass = 'bg-success text-white';
  let nameDisplay = visit.name?.toUpperCase() || 'UNKNOWN';

  if (isBanned) {
    bgClass = 'bg-red-50 hover:bg-red-100';
    statusLabel = '✕ BANNED';
    statusClass = 'bg-danger text-white animate-flash-danger';
  } else if (isDeniedAge) {
    bgClass = 'bg-red-50 hover:bg-red-100';
    statusLabel = '✕ AGE';
    statusClass = 'bg-danger text-white';
    nameDisplay = nameDisplay === 'UNKNOWN' ? 'UNDERAGE' : nameDisplay;
  } else if (hasWarnings) {
    bgClass = 'bg-yellow-50 hover:bg-yellow-100';
    statusLabel = `⚠ ${visit.warning_count}/3`;
    statusClass = 'bg-accent text-ink';
  }

  const gridCols = isAdmin ? '90px 1fr 200px 180px 100px 50px' : '90px 1fr 200px 180px 100px';

  // Skip rendering customer link if no customer_id (orphaned underage attempt)
  if (!visit.customer_id) {
    return (
      <div
        className={`grid items-center px-4 md:px-6 py-2.5 border-b border-neutral-200 ${bgClass}`}
        style={{ gridTemplateColumns: gridCols }}
      >
        <div className="font-mono text-sm font-bold">{time}</div>
        <div className="font-bold text-sm md:text-base truncate">UNDERAGE ATTEMPT</div>
        <div className="hidden md:block font-mono text-xs text-neutral-600 truncate">{visit.ic}</div>
        <div className="hidden md:block font-mono text-xs text-neutral-600">—</div>
        <div className="text-center">
          <span className={`font-display text-[10px] tracking-widest px-2 py-1 ${statusClass}`}>
            {statusLabel}
          </span>
        </div>
        {isAdmin && (
          <button
            onClick={(e) => onDelete(e, visit.id, visit.visited_at, 'UNDERAGE ATTEMPT')}
            className="text-danger hover:scale-110 text-base"
            title="Delete this visit record"
          >
            🗑
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={`md:grid flex flex-col gap-1 items-center px-4 md:px-6 py-2.5 border-b border-neutral-200 transition-colors ${bgClass}`}
      style={{ gridTemplateColumns: gridCols }}
    >
      {/* Mobile: stacked layout */}
      <Link href={`${baseHref}/${visit.customer_id}`} className="md:hidden w-full">
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
            <span className="text-xs text-neutral-400">→</span>
          </div>
        </div>
        <div className="font-bold text-sm truncate flex items-center gap-1.5">
          {visit.membership === 'member' && (
            <span className="font-display text-[9px] tracking-widest px-1.5 py-0.5 bg-success-green text-white flex-shrink-0">⭐</span>
          )}
          {nameDisplay}
        </div>
        <div className="font-mono text-[11px] text-neutral-600 truncate">
          {visit.ic} · {visit.phone || '—'}
        </div>
      </Link>

      {/* Desktop: table layout */}
      <Link href={`${baseHref}/${visit.customer_id}`} className="hidden md:block font-mono text-sm font-bold">{time}</Link>
      <Link href={`${baseHref}/${visit.customer_id}`} className="hidden md:flex items-center gap-1.5 font-bold text-sm truncate">
        {visit.membership === 'member' && (
          <span className="font-display text-[9px] tracking-widest px-1.5 py-0.5 bg-success-green text-white flex-shrink-0">⭐ MEMBER</span>
        )}
        <span className="truncate">{nameDisplay}</span>
      </Link>
      <Link href={`${baseHref}/${visit.customer_id}`} className="hidden md:block font-mono text-xs text-neutral-600 truncate">
        {visit.nationality === 'foreigner' && <span className="text-accent mr-1">🌍</span>}
        {visit.ic}
      </Link>
      <Link href={`${baseHref}/${visit.customer_id}`} className="hidden md:block font-mono text-xs text-neutral-600 truncate">
        {visit.phone || '—'}
      </Link>
      <Link href={`${baseHref}/${visit.customer_id}`} className="hidden md:block text-center">
        <span className={`font-display text-[10px] tracking-widest px-2 py-1 ${statusClass}`}>
          {statusLabel}
        </span>
      </Link>
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
}

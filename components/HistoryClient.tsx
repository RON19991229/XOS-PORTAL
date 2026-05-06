'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-client';
import { formatTime } from '@/lib/utils';

interface HistoryVisit {
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
  membership: 'member' | null;
}

interface HistoryDay {
  day_key: string;
  total: number;
  approved: number;
  denied: number;
  visits: HistoryVisit[];
}

interface HistoryClientProps {
  baseHref: '/staff/customers' | '/admin/customers';
  role: 'staff' | 'admin';
}

const RANGES = [
  { days: 7, label: 'LAST 7 DAYS' },
  { days: 14, label: 'LAST 14 DAYS' },
  { days: 30, label: 'LAST 30 DAYS' },
] as const;

export default function HistoryClient({ baseHref, role }: HistoryClientProps) {
  const supabase = createClient();
  const [days, setDays] = useState<7 | 14 | 30>(14);
  const [history, setHistory] = useState<HistoryDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);

  const isAdmin = role === 'admin';

  const fetchHistory = async (n: 7 | 14 | 30) => {
    setLoading(true);
    const { data } = await supabase.rpc('get_history_visits', { days_back: n });
    if (data) setHistory(data as HistoryDay[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchHistory(days);
  }, [days]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filter visits by search term within each day
  const filteredHistory = useMemo(() => {
    if (!search.trim()) return history;
    const q = search.trim().toLowerCase();
    return history
      .map((d) => ({
        ...d,
        visits: d.visits.filter(
          (v) =>
            (v.name || '').toLowerCase().includes(q) ||
            (v.ic || '').toLowerCase().includes(q) ||
            (v.phone || '').toLowerCase().includes(q)
        ),
      }))
      .filter((d) => d.visits.length > 0);
  }, [history, search]);

  const totalCount = filteredHistory.reduce((sum, d) => sum + d.visits.length, 0);

  // Admin-only: export visits to CSV
  const handleExportCsv = () => {
    setExporting(true);
    try {
      const headers = ['Date', 'Time', 'Name', 'IC/Passport', 'Phone', 'Nationality', 'Status', 'Membership', 'Customer Status'];
      const rows: string[][] = [];

      for (const day of filteredHistory) {
        for (const v of day.visits) {
          const d = new Date(v.visited_at);
          const date = d.toLocaleDateString('en-MY', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            timeZone: 'Asia/Kuala_Lumpur',
          });
          const time = d.toLocaleTimeString('en-MY', {
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
            timeZone: 'Asia/Kuala_Lumpur',
          });
          rows.push([
            date,
            time,
            v.name || '(unknown)',
            v.ic,
            v.phone || '',
            v.nationality || '',
            v.visit_status,
            v.membership === 'member' ? 'MEMBER' : '',
            v.customer_status || '',
          ]);
        }
      }

      const csvLines = [headers, ...rows].map((r) =>
        r.map((cell) => {
          const s = String(cell);
          if (s.includes(',') || s.includes('"') || s.includes('\n')) {
            return `"${s.replace(/"/g, '""')}"`;
          }
          return s;
        }).join(',')
      );
      const csv = csvLines.join('\n');

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `xfitness-history-${days}days-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const formatDayHeader = (dayKey: string) => {
    const [yyyy, mm, dd] = dayKey.split('-').map(Number);
    const d = new Date(yyyy, mm - 1, dd);
    return d.toLocaleDateString('en-MY', {
      weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
    }).toUpperCase();
  };

  return (
    <div className="dashboard-light min-h-screen">
      <div className="bg-white border-b border-neutral-200 px-4 md:px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <div>
            <p className="font-mono text-[10px] tracking-[0.3em] text-neutral-500 mb-1">
              // PAST {days} DAYS
            </p>
            <h1 className="font-display text-3xl md:text-4xl tracking-tight">HISTORY</h1>
          </div>
          {isAdmin && (
            <button
              onClick={handleExportCsv}
              disabled={exporting || totalCount === 0}
              className="font-display text-sm tracking-wider px-4 py-2.5 bg-ink text-bone disabled:opacity-50"
            >
              {exporting ? 'EXPORTING...' : '⬇ EXPORT CSV'}
            </button>
          )}
        </div>

        <div className="flex gap-2 flex-wrap mb-3">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              className={`font-display text-[10px] tracking-widest px-3 py-1.5 border ${
                days === r.days
                  ? 'bg-ink text-bone border-ink'
                  : 'bg-white text-ink border-neutral-300 hover:border-accent'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="SEARCH BY NAME, IC, OR PHONE..."
          className="input-field font-mono text-sm"
        />
      </div>

      {loading ? (
        <div className="text-center py-16 font-mono text-neutral-500">Loading...</div>
      ) : filteredHistory.length === 0 ? (
        <div className="text-center py-20">
          <p className="font-display text-2xl mb-2 text-neutral-700">NO VISITS FOUND</p>
          <p className="font-mono text-xs text-neutral-500">
            {search ? 'Try a different search' : `No check-ins in the past ${days} days`}
          </p>
        </div>
      ) : (
        <div>
          {filteredHistory.map((day) => (
            <DayGroup key={day.day_key} day={day} baseHref={baseHref} formatDayHeader={formatDayHeader} />
          ))}
          <div className="text-center font-mono text-xs text-neutral-500 py-6">
            {totalCount} visit{totalCount !== 1 ? 's' : ''} shown
          </div>
        </div>
      )}
    </div>
  );
}

function DayGroup({
  day, baseHref, formatDayHeader,
}: {
  day: HistoryDay;
  baseHref: string;
  formatDayHeader: (k: string) => string;
}) {
  return (
    <div>
      {/* Day header — sticky-ish summary */}
      <div className="bg-accent text-ink px-4 md:px-6 py-2 flex justify-between items-center font-display text-xs tracking-widest">
        <span>{formatDayHeader(day.day_key)}</span>
        <span className="font-mono text-[11px]">
          {day.total} visit{day.total !== 1 ? 's' : ''} · {day.approved} ok · {day.denied} denied
        </span>
      </div>

      {/* Column headers (desktop) */}
      <div
        className="hidden md:grid bg-ink text-accent px-6 py-2 font-mono text-[10px] tracking-[0.15em]"
        style={{ gridTemplateColumns: '90px 1fr 200px 180px 110px' }}
      >
        <div>TIME</div>
        <div>NAME</div>
        <div>IC / PASSPORT</div>
        <div>PHONE</div>
        <div className="text-center">STATUS</div>
      </div>

      {day.visits.map((v) => (
        <HistoryRow key={v.id} visit={v} baseHref={baseHref} />
      ))}
    </div>
  );
}

function HistoryRow({ visit: v, baseHref }: { visit: HistoryVisit; baseHref: string }) {
  const time = formatTime(v.visited_at);
  const isBanned = v.visit_status === 'denied_banned' || v.customer_status === 'banned';
  const isDeniedAge = v.visit_status === 'denied_age';

  let bgClass = 'bg-white hover:bg-yellow-50';
  let statusLabel = '✓ OK';
  let statusClass = 'bg-success text-white';
  let nameDisplay = v.name?.toUpperCase() || (isDeniedAge ? 'UNDERAGE ATTEMPT' : 'UNKNOWN');

  if (isBanned) {
    bgClass = 'bg-red-50 hover:bg-red-100';
    statusLabel = '✕ BANNED';
    statusClass = 'bg-danger text-white';
  } else if (isDeniedAge) {
    bgClass = 'bg-red-50 hover:bg-red-100';
    statusLabel = '✕ AGE';
    statusClass = 'bg-danger text-white';
  }

  // No customer link if orphaned
  const hasLink = !!v.customer_id;
  const linkProps = hasLink ? { href: `${baseHref}/${v.customer_id}` } : null;
  const RowEl = hasLink ? Link : 'div';

  return (
    <RowEl
      {...(linkProps as any)} // eslint-disable-line @typescript-eslint/no-explicit-any
      className={`md:grid flex flex-col gap-1 items-center px-4 md:px-6 py-2.5 border-b border-neutral-200 ${bgClass} ${hasLink ? 'cursor-pointer' : ''}`}
      style={{ gridTemplateColumns: '90px 1fr 200px 180px 110px' }}
    >
      {/* Mobile stacked */}
      <div className="md:hidden w-full">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-bold">{time}</span>
            <span className={`font-display text-[10px] tracking-widest px-2 py-0.5 ${statusClass}`}>
              {statusLabel}
            </span>
          </div>
        </div>
        <div className="font-bold text-sm truncate flex items-center gap-1.5">
          {v.membership === 'member' && (
            <span className="font-display text-[9px] tracking-widest px-1.5 py-0.5 bg-success-green text-white flex-shrink-0">⭐</span>
          )}
          {nameDisplay}
        </div>
        <div className="font-mono text-[11px] text-neutral-600 truncate">
          {v.ic} · {v.phone || '—'}
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block font-mono text-sm font-bold">{time}</div>
      <div className="hidden md:flex items-center gap-1.5 font-bold text-sm truncate">
        {v.membership === 'member' && (
          <span className="font-display text-[9px] tracking-widest px-1.5 py-0.5 bg-success-green text-white flex-shrink-0">⭐ MEMBER</span>
        )}
        <span className="truncate">{nameDisplay}</span>
      </div>
      <div className="hidden md:block font-mono text-xs text-neutral-600 truncate">
        {v.nationality === 'foreigner' && <span className="text-accent mr-1">🌍</span>}
        {v.ic}
      </div>
      <div className="hidden md:block font-mono text-xs text-neutral-600 truncate">
        {v.phone || '—'}
      </div>
      <div className="hidden md:block text-center">
        <span className={`font-display text-[10px] tracking-widest px-2 py-1 ${statusClass}`}>
          {statusLabel}
        </span>
      </div>
    </RowEl>
  );
}

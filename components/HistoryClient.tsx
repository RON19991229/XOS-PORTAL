'use client';

import { memo, useDeferredValue, useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-client';
import { getCached, setCached } from '@/lib/client-cache';
import { formatTime, parseTimestamp, calcAge, parseICDob } from '@/lib/utils';
import { PrivateNum } from '@/lib/privacy';
import GenderBadge from './GenderBadge';

// v2.22.0 — "A · Control Room (light)" restyle: compact range + chip
// toolbar, one sticky column header with sticky day bars, names/IC/phone
// blurred and every count hidden while privacy mode is on. Filtering,
// pagination and CSV export are unchanged.

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
  gender: 'male' | 'female' | null;
  dob: string | null;
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

// ---- Filter option definitions ----
type GenderFilter = 'all' | 'male' | 'female';
type AgeFilter = 'all' | 'u18' | '18-24' | '25-34' | '35-44' | '45-54' | '55+';
type TimeFilter = 'all' | 'morning' | 'afternoon' | 'evening' | 'night';
type FreqFilter = 'all' | '1' | '2-5' | '6-10' | '11-20' | '20+';

const AGE_OPTIONS: { key: AgeFilter; label: string }[] = [
  { key: 'all', label: 'ALL' },
  { key: 'u18', label: '<18' },
  { key: '18-24', label: '18-24' },
  { key: '25-34', label: '25-34' },
  { key: '35-44', label: '35-44' },
  { key: '45-54', label: '45-54' },
  { key: '55+', label: '55+' },
];

const TIME_OPTIONS: { key: TimeFilter; label: string }[] = [
  { key: 'all', label: 'ALL' },
  { key: 'morning', label: 'MORNING' },
  { key: 'afternoon', label: 'AFTERNOON' },
  { key: 'evening', label: 'EVENING' },
  { key: 'night', label: 'NIGHT' },
];

const FREQ_OPTIONS: { key: FreqFilter; label: string }[] = [
  { key: 'all', label: 'ALL' },
  { key: '1', label: '1 VISIT' },
  { key: '2-5', label: '2-5' },
  { key: '6-10', label: '6-10' },
  { key: '11-20', label: '11-20' },
  { key: '20+', label: '20+' },
];

const QUICK_RANGES = [
  { key: 'today', label: 'TODAY', days: 0 },
  { key: '7d', label: '7D', days: 7 },
  { key: '14d', label: '14D', days: 14 },
  { key: '30d', label: '30D', days: 30 },
  { key: 'month', label: 'THIS MONTH', days: -1 }, // special: from 1st of month
] as const;

// ---- Date helpers (KL-local calendar dates as YYYY-MM-DD strings) ----
// We work with KL-local "day keys" to match the RPC's day grouping.
function klTodayKey(): string {
  // en-CA gives YYYY-MM-DD; timeZone pins it to KL regardless of browser tz.
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
}

function klDayKeyOf(iso: string): string {
  const d = parseTimestamp(iso) ?? new Date(iso);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
}

// KL-local hour (0-23) of a visit timestamp, for the Visit Time filter.
// v2.15.0: uses a single cached Intl.DateTimeFormat — toLocaleString()
// constructs a new formatter on every call (~100x slower), and this runs
// once per visit, so a 30-day range used to build thousands of formatters.
const KL_HOUR_FMT = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit', hour12: false, timeZone: 'Asia/Kuala_Lumpur',
});
function klHourOf(iso: string): number {
  const d = parseTimestamp(iso) ?? new Date(iso);
  const hh = KL_HOUR_FMT.format(d);
  // "24" can appear for midnight in some environments; normalise to 0.
  const n = parseInt(hh, 10);
  return n === 24 ? 0 : n;
}

// Subtract n days from a YYYY-MM-DD key, returning a new YYYY-MM-DD key.
function subtractDaysKey(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - n);
  return dt.toISOString().slice(0, 10);
}

function firstOfMonthKey(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

// Inclusive day difference between two YYYY-MM-DD keys.
function dayDiff(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split('-').map(Number);
  const [ty, tm, td] = toKey.split('-').map(Number);
  const a = Date.UTC(fy, fm - 1, fd);
  const b = Date.UTC(ty, tm - 1, td);
  return Math.round((b - a) / 86400000);
}

// Which time-of-day bucket an hour falls into.
function timeBucket(hour: number): TimeFilter {
  if (hour >= 6 && hour <= 11) return 'morning';
  if (hour >= 12 && hour <= 17) return 'afternoon';
  if (hour >= 18 && hour <= 21) return 'evening';
  return 'night'; // 22:00–05:59
}

// Age bucket for a visit (prefers dob, falls back to IC-derived dob).
function ageBucket(v: HistoryVisit): AgeFilter | 'unknown' {
  let dob: Date | null = null;
  if (v.dob) {
    const parsed = new Date(v.dob + 'T00:00:00');
    if (!isNaN(parsed.getTime())) dob = parsed;
  }
  if (!dob && v.ic) dob = parseICDob(v.ic);
  const age = calcAge(dob);
  if (age < 0) return 'unknown';
  if (age < 18) return 'u18';
  if (age <= 24) return '18-24';
  if (age <= 34) return '25-34';
  if (age <= 44) return '35-44';
  if (age <= 54) return '45-54';
  return '55+';
}

function freqBucket(count: number): FreqFilter {
  if (count <= 1) return '1';
  if (count <= 5) return '2-5';
  if (count <= 10) return '6-10';
  if (count <= 20) return '11-20';
  return '20+';
}

export default function HistoryClient({ baseHref, role }: HistoryClientProps) {
  const supabase = createClient();

  // Date range state (KL-local YYYY-MM-DD keys)
  const today = klTodayKey();
  const [fromKey, setFromKey] = useState<string>(subtractDaysKey(today, 14));
  const [toKey, setToKey] = useState<string>(today);
  const [activeQuick, setActiveQuick] = useState<string | null>('14d');

  // Data
  const [history, setHistory] = useState<HistoryDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [genderF, setGenderF] = useState<GenderFilter>('all');
  const [ageF, setAgeF] = useState<AgeFilter>('all');
  const [timeF, setTimeF] = useState<TimeFilter>('all');
  const [freqF, setFreqF] = useState<FreqFilter>('all');

  const isAdmin = role === 'admin';

  // Fetch: pass the days-difference of the selected range to the existing RPC,
  // then we trim precisely to [fromKey, toKey] on the client (Method A).
  const fetchHistory = async (from: string, to: string) => {
    // days_back is counted from KL "today"; fetch enough to cover `from`.
    const daysBack = Math.max(0, dayDiff(from, today)) + 1;
    // Trim to the selected window (RPC returns from `from`..today; we cut off
    // anything after `to`).
    const trim = (days: HistoryDay[]) =>
      days.filter((d) => d.day_key >= from && d.day_key <= to);

    // v2.19.0: if this range was loaded earlier in this tab, show it
    // immediately and refresh in the background (no "Loading..." flash).
    const cacheKey = `history:${today}:${daysBack}`;
    const cached = getCached<HistoryDay[]>(cacheKey);
    if (cached) {
      setHistory(trim(cached));
      setLoading(false);
    } else {
      setLoading(true);
    }

    const { data } = await supabase.rpc('get_history_visits', { days_back: daysBack });
    if (data) {
      setCached(cacheKey, data as HistoryDay[]);
      setHistory(trim(data as HistoryDay[]));
    } else if (!cached) {
      setHistory([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchHistory(fromKey, toKey);
  }, [fromKey, toKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Quick-range buttons
  const applyQuick = (key: string, days: number) => {
    const t = klTodayKey();
    if (days === 0) {
      setFromKey(t); setToKey(t);
    } else if (days === -1) {
      setFromKey(firstOfMonthKey(t)); setToKey(t);
    } else {
      setFromKey(subtractDaysKey(t, days)); setToKey(t);
    }
    setActiveQuick(key);
  };

  const onFromChange = (val: string) => {
    setFromKey(val);
    setActiveQuick(null);
    if (val > toKey) setToKey(val);
  };
  const onToChange = (val: string) => {
    setToKey(val);
    setActiveQuick(null);
    if (val < fromKey) setFromKey(val);
  };

  // Deferred search — keeps the input responsive while filtering thousands
  // of visits runs at lower priority.
  const deferredSearch = useDeferredValue(search);

  // Per-customer visit counts WITHIN the selected range (for Frequency filter).
  const visitCountByCustomer = useMemo(() => {
    const m = new Map<string, number>();
    for (const day of history) {
      for (const v of day.visits) {
        const key = v.customer_id || `ic:${v.ic}`;
        m.set(key, (m.get(key) || 0) + 1);
      }
    }
    return m;
  }, [history]);

  // v2.15.0: time-of-day + age buckets are derived ONCE per fetch, keyed by
  // visit id. Previously ageBucket() (IC parsing + date math) and klHourOf()
  // (timezone conversion) re-ran for EVERY visit on EVERY filter change and
  // again inside every chip-count memo — thousands of redundant calls per
  // keystroke on a 30-day range. Now each visit is computed exactly once.
  const visitMeta = useMemo(() => {
    const m = new Map<string, { time: TimeFilter; age: AgeFilter | 'unknown' }>();
    for (const day of history) {
      for (const v of day.visits) {
        m.set(v.id, { time: timeBucket(klHourOf(v.visited_at)), age: ageBucket(v) });
      }
    }
    return m;
  }, [history]);

  // Apply ALL filters per visit.
  const filteredHistory = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();

    return history
      .map((d) => ({
        ...d,
        visits: d.visits.filter((v) => {
          // Search
          if (q) {
            const hit =
              (v.name || '').toLowerCase().includes(q) ||
              (v.ic || '').toLowerCase().includes(q) ||
              (v.phone || '').toLowerCase().includes(q);
            if (!hit) return false;
          }
          // Gender
          if (genderF !== 'all' && v.gender !== genderF) return false;
          // Age (precomputed)
          if (ageF !== 'all' && visitMeta.get(v.id)?.age !== ageF) return false;
          // Time of day (precomputed)
          if (timeF !== 'all' && visitMeta.get(v.id)?.time !== timeF) return false;
          // Frequency within range
          if (freqF !== 'all') {
            const key = v.customer_id || `ic:${v.ic}`;
            if (freqBucket(visitCountByCustomer.get(key) || 0) !== freqF) return false;
          }
          return true;
        }),
      }))
      .filter((d) => d.visits.length > 0)
      // Recompute day summary counts to reflect the filtered set.
      .map((d) => {
        const approved = d.visits.filter((v) => v.visit_status === 'approved').length;
        return {
          ...d,
          total: d.visits.length,
          approved,
          denied: d.visits.length - approved,
        };
      });
  }, [history, deferredSearch, genderF, ageF, timeF, freqF, visitCountByCustomer, visitMeta]);

  const totalCount = filteredHistory.reduce((sum, d) => sum + d.visits.length, 0);

  const anyFilterActive =
    genderF !== 'all' || ageF !== 'all' || timeF !== 'all' || freqF !== 'all' || search.trim() !== '';

  const clearAll = () => {
    setGenderF('all'); setAgeF('all'); setTimeF('all'); setFreqF('all'); setSearch('');
  };

  // ---- Dynamic counts for chips (respect the current range, independent of
  //      the chip's own dimension so numbers stay intuitive) ----
  const allVisitsInRange = useMemo(
    () => history.flatMap((d) => d.visits),
    [history]
  );

  const genderCounts = useMemo(() => {
    let m = 0, f = 0;
    for (const v of allVisitsInRange) {
      if (v.gender === 'male') m++;
      else if (v.gender === 'female') f++;
    }
    return { male: m, female: f };
  }, [allVisitsInRange]);

  const ageCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const v of allVisitsInRange) {
      const b = visitMeta.get(v.id)?.age ?? 'unknown';
      if (b !== 'unknown') c[b] = (c[b] || 0) + 1;
    }
    return c;
  }, [allVisitsInRange, visitMeta]);

  const timeCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const v of allVisitsInRange) {
      const b = visitMeta.get(v.id)?.time;
      if (b) c[b] = (c[b] || 0) + 1;
    }
    return c;
  }, [allVisitsInRange, visitMeta]);

  const freqCounts = useMemo(() => {
    // Count of VISITS whose owner falls into each frequency bucket.
    const c: Record<string, number> = {};
    for (const v of allVisitsInRange) {
      const key = v.customer_id || `ic:${v.ic}`;
      const b = freqBucket(visitCountByCustomer.get(key) || 0);
      c[b] = (c[b] || 0) + 1;
    }
    return c;
  }, [allVisitsInRange, visitCountByCustomer]);

  // Admin-only: export visits to CSV (respects current filters)
  const handleExportCsv = () => {
    setExporting(true);
    try {
      const headers = ['Date', 'Time', 'Name', 'IC/Passport', 'Phone', 'Nationality', 'Gender', 'Status', 'Membership', 'Customer Status'];
      const rows: string[][] = [];

      for (const day of filteredHistory) {
        for (const v of day.visits) {
          const d = parseTimestamp(v.visited_at) ?? new Date(v.visited_at);
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
            v.gender || '',
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
      a.download = `xfitness-history-${fromKey}_to_${toKey}.csv`;
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

  const gridCols = '80px minmax(0,1fr) 180px 170px 112px';

  return (
    <div>
      <div className="bg-white border-b border-line px-4 md:px-6 py-3.5 flex flex-col gap-2.5">
        {/* ---- Range row ---- */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-mono text-[10px] tracking-[0.18em] text-muted w-[60px] flex-shrink-0">RANGE</span>
          {QUICK_RANGES.map((r) => (
            <Chip key={r.key} active={activeQuick === r.key} onClick={() => applyQuick(r.key, r.days)}>
              {r.label}
            </Chip>
          ))}
          <span className="w-2" />
          <input
            type="date"
            value={fromKey}
            max={toKey}
            onChange={(e) => onFromChange(e.target.value)}
            aria-label="From"
            className="h-[30px] border border-line-strong bg-white px-2 font-mono text-xs outline-none focus:border-ink"
          />
          <span className="font-mono text-muted">→</span>
          <input
            type="date"
            value={toKey}
            min={fromKey}
            max={today}
            onChange={(e) => onToChange(e.target.value)}
            aria-label="To"
            className="h-[30px] border border-line-strong bg-white px-2 font-mono text-xs outline-none focus:border-ink"
          />
          <div className="flex-1" />
          <span className="flex items-baseline gap-1.5">
            <span className="font-mono text-[10px] tracking-[0.2em] text-muted">SHOWING</span>
            <PrivateNum value={totalCount} className="font-display text-xl" />
            <span className="font-mono text-[10px] tracking-[0.2em] text-muted">VISITS</span>
          </span>
          {isAdmin && (
            <button
              onClick={handleExportCsv}
              disabled={exporting || totalCount === 0}
              className="h-[30px] ml-2 font-mono text-[10px] font-bold tracking-[0.1em] px-3 bg-ink text-accent disabled:opacity-50"
            >
              {exporting ? 'EXPORTING...' : '⬇ EXPORT CSV'}
            </button>
          )}
        </div>

        {/* ---- Filter rows ---- */}
        <FilterRow label="GENDER">
          <Chip active={genderF === 'all'} onClick={() => setGenderF('all')}>ALL</Chip>
          <Chip active={genderF === 'male'} onClick={() => setGenderF('male')}>
            ♂ MALE <Count>{genderCounts.male}</Count>
          </Chip>
          <Chip active={genderF === 'female'} onClick={() => setGenderF('female')}>
            ♀ FEMALE <Count>{genderCounts.female}</Count>
          </Chip>
        </FilterRow>

        <FilterRow label="AGE">
          {AGE_OPTIONS.map((o) => (
            <Chip key={o.key} active={ageF === o.key} onClick={() => setAgeF(o.key)}>
              {o.label}
              {o.key !== 'all' && <Count>{ageCounts[o.key] || 0}</Count>}
            </Chip>
          ))}
        </FilterRow>

        <FilterRow label="TIME">
          {TIME_OPTIONS.map((o) => (
            <Chip key={o.key} active={timeF === o.key} onClick={() => setTimeF(o.key)}>
              {o.label}
              {o.key !== 'all' && <Count>{timeCounts[o.key] || 0}</Count>}
            </Chip>
          ))}
        </FilterRow>

        <FilterRow label="FREQ">
          {FREQ_OPTIONS.map((o) => (
            <Chip key={o.key} active={freqF === o.key} onClick={() => setFreqF(o.key)}>
              {o.label}
              {o.key !== 'all' && <Count>{freqCounts[o.key] || 0}</Count>}
            </Chip>
          ))}
        </FilterRow>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, IC or phone…"
          className="h-10 w-full max-w-[460px] border border-line-strong bg-white px-3 text-sm outline-none focus:border-ink"
        />
      </div>

      {/* ---- Active filter summary ---- */}
      {anyFilterActive && !loading && (
        <div className="bg-[#fffbe6] border-b border-line px-4 md:px-6 py-2 flex justify-between items-center">
          <span className="font-mono text-[11px] text-[#6b5500]">
            showing <b><PrivateNum value={totalCount} /></b> visit{totalCount !== 1 ? 's' : ''}
            {genderF !== 'all' && ` · ${genderF === 'male' ? '♂ MALE' : '♀ FEMALE'}`}
            {ageF !== 'all' && ` · AGE ${AGE_OPTIONS.find((o) => o.key === ageF)?.label}`}
            {timeF !== 'all' && ` · ${TIME_OPTIONS.find((o) => o.key === timeF)?.label}`}
            {freqF !== 'all' && ` · ${FREQ_OPTIONS.find((o) => o.key === freqF)?.label}`}
            {search.trim() && ` · "${search.trim()}"`}
          </span>
          <button onClick={clearAll} className="font-mono text-[10px] font-bold tracking-wider text-danger flex-shrink-0 ml-2">
            ✕ CLEAR ALL
          </button>
        </div>
      )}

      <div className="bg-white min-h-[calc(100vh-16rem)]">
        <div
          className="hidden md:grid gap-3 bg-ink text-accent px-6 py-2.5 font-mono text-[10px] font-bold tracking-[0.18em] sticky top-16 z-10"
          style={{ gridTemplateColumns: gridCols }}
        >
          <div>TIME</div>
          <div>NAME</div>
          <div>IC / PASSPORT</div>
          <div>PHONE</div>
          <div className="text-center">STATUS</div>
        </div>

        {loading ? (
          <div className="text-center py-16 font-mono text-muted">Loading...</div>
        ) : filteredHistory.length === 0 ? (
          <div className="text-center py-20">
            <p className="font-display text-2xl mb-2 text-neutral-700">NO VISITS FOUND</p>
            <p className="font-mono text-xs text-muted">
              {anyFilterActive ? 'Try adjusting your filters or date range' : 'No check-ins in this date range'}
            </p>
          </div>
        ) : (
          <div>
            {filteredHistory.map((day) => (
              <DayGroup key={day.day_key} day={day} baseHref={baseHref} gridCols={gridCols} formatDayHeader={formatDayHeader} />
            ))}
            <div className="text-center font-mono text-xs text-muted py-6">
              <PrivateNum value={totalCount} /> visit{totalCount !== 1 ? 's' : ''} shown
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Small presentational helpers ----
function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-1.5 flex-wrap items-center">
      <span className="font-mono text-[10px] tracking-[0.18em] text-muted w-[60px] flex-shrink-0">{label}</span>
      {children}
    </div>
  );
}

function Chip({
  active, onClick, children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`h-[30px] px-2.5 font-mono text-[10px] font-bold tracking-[0.1em] border whitespace-nowrap transition-colors ${
        active ? 'bg-ink text-accent border-ink' : 'bg-white text-muted border-line-strong hover:border-ink hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}

function Count({ children }: { children: React.ReactNode }) {
  return <PrivateNum value={children} className="ml-1 font-normal opacity-80" />;
}

function DayGroup({
  day, baseHref, gridCols, formatDayHeader,
}: {
  day: HistoryDay;
  baseHref: string;
  gridCols: string;
  formatDayHeader: (k: string) => string;
}) {
  return (
    <div>
      <div className="sticky top-16 md:top-[100px] z-[5] bg-paper border-b border-line px-4 md:px-6 py-2 flex justify-between items-center font-mono text-[11px] font-bold tracking-[0.15em]">
        <span>{formatDayHeader(day.day_key)}</span>
        <span className="text-muted font-normal">
          <PrivateNum value={`${day.total} visit${day.total !== 1 ? 's' : ''} · ${day.approved} ok · ${day.denied} denied`} />
        </span>
      </div>

      {day.visits.map((v) => (
        <HistoryRow key={v.id} visit={v} baseHref={baseHref} gridCols={gridCols} />
      ))}
    </div>
  );
}

// Memoized: visit objects keep identity across filter recomputes, so
// unchanged rows skip re-rendering.
const HistoryRow = memo(function HistoryRow({
  visit: v, baseHref, gridCols,
}: {
  visit: HistoryVisit;
  baseHref: string;
  gridCols: string;
}) {
  const time = formatTime(v.visited_at);
  const isBanned = v.visit_status === 'denied_banned' || v.customer_status === 'banned';
  const isDeniedAge = v.visit_status === 'denied_age';
  const nameDisplay = v.name?.toUpperCase() || (isDeniedAge ? 'UNDERAGE ATTEMPT' : 'UNKNOWN');

  const conf = isBanned
    ? { bg: 'bg-[#fff1f0]', label: 'BANNED', cls: 'bg-danger text-white' }
    : isDeniedAge
    ? { bg: 'bg-[#fff6f5]', label: 'UNDER 12', cls: 'bg-danger text-white' }
    : { bg: 'bg-white', label: 'ALLOWED', cls: 'bg-success-green text-ink' };

  const hasLink = !!v.customer_id;
  const linkProps = hasLink ? { href: `${baseHref}/${v.customer_id}` } : null;
  const RowEl = hasLink ? Link : 'div';
  const pill = (
    <span className={`inline-block font-mono text-[10px] font-bold tracking-[0.12em] px-2 py-1 ${conf.cls}`}>{conf.label}</span>
  );
  const member = v.membership === 'member' && (
    <span className="font-mono text-[9px] font-bold tracking-[0.12em] px-1.5 py-0.5 bg-success-green text-ink flex-shrink-0">MEMBER</span>
  );

  return (
    <RowEl
      {...(linkProps as any)} // eslint-disable-line @typescript-eslint/no-explicit-any
      className={`md:grid flex flex-col gap-1 md:gap-3 items-center px-4 md:px-6 py-2.5 min-h-[52px] border-b border-line ${conf.bg} ${
        hasLink ? 'cursor-pointer hover:bg-[#fffbe0]' : ''
      }`}
      style={{ gridTemplateColumns: gridCols }}
    >
      {/* Mobile stacked */}
      <div className="md:hidden w-full">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-mono text-sm font-bold">{time}</span>
          {pill}
        </div>
        <div className="font-bold text-sm truncate flex items-center gap-1.5">
          {member}
          <GenderBadge gender={v.gender} />
          <span className="sens truncate">{nameDisplay}</span>
        </div>
        <div className="sens font-mono text-[11px] text-muted truncate">
          {v.ic} · {v.phone || '—'}
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block font-mono text-sm font-bold">{time}</div>
      <div className="hidden md:flex items-center gap-2 font-bold text-sm min-w-0">
        {member}
        <GenderBadge gender={v.gender} />
        <span className="sens truncate">{nameDisplay}</span>
      </div>
      <div className="hidden md:block font-mono text-xs text-muted truncate">
        {v.nationality === 'foreigner' && <span className="mr-1">🌍</span>}
        <span className="sens">{v.ic}</span>
      </div>
      <div className="hidden md:block font-mono text-xs text-muted truncate">
        <span className="sens">{v.phone || '—'}</span>
      </div>
      <div className="hidden md:block text-center">{pill}</div>
    </RowEl>
  );
});

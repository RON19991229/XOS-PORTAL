'use client';

import { memo, useDeferredValue, useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-client';
import { formatTime, parseTimestamp, calcAge, parseICDob } from '@/lib/utils';
import GenderBadge from './GenderBadge';

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
    setLoading(true);
    // days_back is counted from KL "today"; fetch enough to cover `from`.
    const daysBack = Math.max(0, dayDiff(from, today)) + 1;
    const { data } = await supabase.rpc('get_history_visits', { days_back: daysBack });
    if (data) {
      // Trim to the selected window (RPC returns from `from`..today; we cut off
      // anything after `to`).
      const trimmed = (data as HistoryDay[]).filter(
        (d) => d.day_key >= from && d.day_key <= to
      );
      setHistory(trimmed);
    } else {
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

  const rangeLabel = `${fromKey} — ${toKey}`;

  return (
    <div className="dashboard-light min-h-screen">
      <div className="bg-white border-b border-neutral-200 px-4 md:px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <div>
            <p className="font-mono text-[10px] tracking-[0.3em] text-neutral-500 mb-1">
              // {rangeLabel}
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

        {/* ---- Date range card ---- */}
        <div className="bg-ink p-3 md:p-4 mb-3">
          <p className="font-mono text-[9px] tracking-[0.2em] text-accent mb-2.5">📅 DATE RANGE</p>
          <div className="flex gap-2.5 items-end">
            <div className="flex-1">
              <label className="block font-mono text-[9px] tracking-wider text-neutral-400 mb-1">FROM</label>
              <input
                type="date"
                value={fromKey}
                max={toKey}
                onChange={(e) => onFromChange(e.target.value)}
                className="w-full bg-ink-soft border border-ink-line text-bone px-2.5 py-2 font-mono text-sm focus:outline-none focus:border-accent"
              />
            </div>
            <span className="text-neutral-500 pb-2">→</span>
            <div className="flex-1">
              <label className="block font-mono text-[9px] tracking-wider text-neutral-400 mb-1">TO</label>
              <input
                type="date"
                value={toKey}
                min={fromKey}
                max={today}
                onChange={(e) => onToChange(e.target.value)}
                className="w-full bg-ink-soft border border-ink-line text-bone px-2.5 py-2 font-mono text-sm focus:outline-none focus:border-accent"
              />
            </div>
          </div>
          <div className="flex gap-1.5 flex-wrap mt-2.5">
            {QUICK_RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => applyQuick(r.key, r.days)}
                className={`font-display text-[9px] tracking-wider px-2.5 py-1.5 border ${
                  activeQuick === r.key
                    ? 'bg-accent text-ink border-accent'
                    : 'bg-ink-soft text-neutral-400 border-ink-line hover:border-accent'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* ---- Filter rows ---- */}
        <div className="space-y-2.5 mb-3">
          <FilterRow label="GENDER">
            <Chip active={genderF === 'all'} onClick={() => setGenderF('all')}>ALL</Chip>
            <Chip active={genderF === 'male'} onClick={() => setGenderF('male')}>
              ♂ MALE <Count active={genderF === 'male'}>{genderCounts.male}</Count>
            </Chip>
            <Chip active={genderF === 'female'} onClick={() => setGenderF('female')}>
              ♀ FEMALE <Count active={genderF === 'female'}>{genderCounts.female}</Count>
            </Chip>
          </FilterRow>

          <FilterRow label="AGE">
            {AGE_OPTIONS.map((o) => (
              <Chip key={o.key} active={ageF === o.key} onClick={() => setAgeF(o.key)}>
                {o.label}
                {o.key !== 'all' && (
                  <Count active={ageF === o.key}>{ageCounts[o.key] || 0}</Count>
                )}
              </Chip>
            ))}
          </FilterRow>

          <FilterRow label="TIME">
            {TIME_OPTIONS.map((o) => (
              <Chip key={o.key} active={timeF === o.key} onClick={() => setTimeF(o.key)}>
                {o.label}
                {o.key !== 'all' && (
                  <Count active={timeF === o.key}>{timeCounts[o.key] || 0}</Count>
                )}
              </Chip>
            ))}
          </FilterRow>

          <FilterRow label="FREQ">
            {FREQ_OPTIONS.map((o) => (
              <Chip key={o.key} active={freqF === o.key} onClick={() => setFreqF(o.key)}>
                {o.label}
                {o.key !== 'all' && (
                  <Count active={freqF === o.key}>{freqCounts[o.key] || 0}</Count>
                )}
              </Chip>
            ))}
          </FilterRow>
        </div>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="SEARCH BY NAME, IC, OR PHONE..."
          className="input-field font-mono text-sm"
        />
      </div>

      {/* ---- Active filter summary ---- */}
      {anyFilterActive && !loading && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-4 md:px-6 py-2 flex justify-between items-center">
          <span className="font-mono text-[11px] text-yellow-800">
            showing <b>{totalCount}</b> visit{totalCount !== 1 ? 's' : ''}
            {genderF !== 'all' && ` · ${genderF === 'male' ? '♂ MALE' : '♀ FEMALE'}`}
            {ageF !== 'all' && ` · AGE ${AGE_OPTIONS.find((o) => o.key === ageF)?.label}`}
            {timeF !== 'all' && ` · ${TIME_OPTIONS.find((o) => o.key === timeF)?.label}`}
            {freqF !== 'all' && ` · ${FREQ_OPTIONS.find((o) => o.key === freqF)?.label}`}
            {search.trim() && ` · "${search.trim()}"`}
          </span>
          <button
            onClick={clearAll}
            className="font-display text-[9px] tracking-wider text-danger flex-shrink-0 ml-2"
          >
            ✕ CLEAR ALL
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 font-mono text-neutral-500">Loading...</div>
      ) : filteredHistory.length === 0 ? (
        <div className="text-center py-20">
          <p className="font-display text-2xl mb-2 text-neutral-700">NO VISITS FOUND</p>
          <p className="font-mono text-xs text-neutral-500">
            {anyFilterActive ? 'Try adjusting your filters or date range' : 'No check-ins in this date range'}
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

// ---- Small presentational helpers ----
function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 flex-wrap items-center">
      <span className="font-mono text-[9px] tracking-[0.15em] text-neutral-500 font-bold w-[52px] flex-shrink-0">
        {label}
      </span>
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
      className={`font-display text-[10px] tracking-wider px-2.5 py-1.5 border whitespace-nowrap ${
        active
          ? 'bg-ink text-bone border-ink'
          : 'bg-white text-ink border-neutral-300 hover:border-accent'
      }`}
    >
      {children}
    </button>
  );
}

function Count({ children, active }: { children: React.ReactNode; active: boolean }) {
  return (
    <span className={`ml-1 font-mono font-normal ${active ? 'text-accent' : 'text-accent'}`}>
      {children}
    </span>
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
      <div className="bg-accent text-ink px-4 md:px-6 py-2 flex justify-between items-center font-display text-xs tracking-widest">
        <span>{formatDayHeader(day.day_key)}</span>
        <span className="font-mono text-[11px]">
          {day.total} visit{day.total !== 1 ? 's' : ''} · {day.approved} ok · {day.denied} denied
        </span>
      </div>

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

// Memoized: visit objects keep identity across filter recomputes, so
// unchanged rows skip re-rendering.
const HistoryRow = memo(function HistoryRow({ visit: v, baseHref }: { visit: HistoryVisit; baseHref: string }) {
  const time = formatTime(v.visited_at);
  const isBanned = v.visit_status === 'denied_banned' || v.customer_status === 'banned';
  const isDeniedAge = v.visit_status === 'denied_age';

  let bgClass = 'bg-white hover:bg-yellow-50';
  let statusLabel = '✓ OK';
  let statusClass = 'bg-success text-white';
  const nameDisplay = v.name?.toUpperCase() || (isDeniedAge ? 'UNDERAGE ATTEMPT' : 'UNKNOWN');

  if (isBanned) {
    bgClass = 'bg-red-50 hover:bg-red-100';
    statusLabel = '✕ BANNED';
    statusClass = 'bg-danger text-white';
  } else if (isDeniedAge) {
    bgClass = 'bg-red-50 hover:bg-red-100';
    statusLabel = '✕ AGE';
    statusClass = 'bg-danger text-white';
  }

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
          <GenderBadge gender={v.gender} />
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
        <GenderBadge gender={v.gender} />
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
});

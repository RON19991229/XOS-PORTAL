'use client';

import { memo, useDeferredValue, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-client';
import { getCached, setCached } from '@/lib/client-cache';
import { Customer } from '@/lib/types';
import GenderBadge from './GenderBadge';

interface CustomerListProps {
  baseHref: '/staff/customers' | '/admin/customers';
  role: 'staff' | 'admin';
}

type StatusFilter = 'all' | 'active' | 'warned' | 'banned';
type TypeFilter = 'all' | 'member' | 'walkin' | 'local' | 'foreign';
type ActivityFilter = 'all' | 'frequent' | 'inactive' | 'new';
type SortKey =
  | 'recent'           // by created_at desc (default — what v2.4 did)
  | 'visits_desc'      // 🔥 most visits first
  | 'visits_asc'       // fewest visits first
  | 'last_visit_desc'  // most recently seen first
  | 'last_visit_asc'   // longest-ago seen first (流失 risk)
  | 'name_asc';        // alphabetical

const FREQUENT_THRESHOLD = 10;             // 10+ visits = "frequent"
const INACTIVE_DAYS = 30;                  // no visit in 30 days = "inactive"
const NEW_DAYS = 7;                        // registered in last 7 days = "new"

// v2.15.0: render the list in chunks. Mounting all 1,600+ rows at once
// (each with a mobile AND a desktop layout) creates tens of thousands of
// DOM nodes and makes the initial paint + every filter change janky.
// Filtering/sorting still runs over the FULL dataset — only the number of
// rows mounted in the DOM is capped, with a LOAD MORE button to extend.
const RENDER_CHUNK = 200;

const CUSTOMER_COLUMNS =
  'id, name, ic, phone, nationality, status, warning_count, membership, gender, visit_count, last_visit_at, created_at';
const CACHE_KEY = 'customers:list';

export default function CustomerList({ baseHref, role }: CustomerListProps) {
  const supabase = useMemo(() => createClient(), []);
  // v2.19.0: start from the in-tab cache (if this page was visited before)
  // so the list appears instantly; the full fetch below then refreshes it.
  const [customers, setCustomers] = useState<Customer[]>(() => getCached<Customer[]>(CACHE_KEY) ?? []);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('recent');
  const [loading, setLoading] = useState(() => !getCached<Customer[]>(CACHE_KEY));
  const [renderLimit, setRenderLimit] = useState(RENDER_CHUNK);

  // Deferred search: the input itself stays instantly responsive while the
  // expensive filter+sort over 1,600+ rows runs at lower priority. React
  // may skip intermediate keystrokes entirely instead of blocking typing.
  const deferredSearch = useDeferredValue(search);

  const isAdmin = role === 'admin';

  // Fetch ALL customers via pagination. Supabase's PostgREST gateway caps
  // every response at 1000 rows (project-level max-rows), regardless of any
  // .limit() we set. Once the customer base passed 1000, a single request
  // silently returned only the first 1000 rows (oldest, since there was no
  // ORDER BY), so the newest customers never appeared in the list.
  //
  // Fix: page through the table in 1000-row chunks with a stable sort
  // (created_at desc, then id as a tie-breaker so rows can't be skipped or
  // duplicated across page boundaries), accumulating until a short page
  // signals the end. As of v2.15.0 this runs exactly ONCE on mount —
  // status filtering moved client-side (see statusFiltered below).
  //
  // v2.19.0: pages are fetched in PARALLEL. Page 0 also asks for the exact
  // row count, which tells us how many more pages exist; those are then
  // requested all at once instead of one after another (~4,200 customers =
  // 5 pages: 2 round trips instead of 5). Rows are de-duplicated by id in
  // case a customer registers between page requests and shifts a boundary.
  const PAGE_SIZE = 1000;
  const MAX_PAGES = 50; // hard safety cap (50k rows) to prevent any runaway loop

  const fetchPage = (page: number, withCount = false) =>
    supabase
      .from('customers')
      // v2.15.0: no status filter in the query — the full set is loaded once
      // and filtered client-side, so chip switches need zero network traffic.
      .select(CUSTOMER_COLUMNS, withCount ? { count: 'exact' } : undefined)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

  const fetchCustomers = async () => {
    const first = await fetchPage(0, true);
    if (first.error) {
      // Keep whatever is on screen (cached rows) rather than blanking it.
      console.error('fetchCustomers page 0 failed:', first.error.message);
      setLoading(false);
      return;
    }

    const firstRows = (first.data ?? []) as Customer[];
    // If count is unavailable, fall back to "one more page if page 0 was full".
    const total = first.count ?? (firstRows.length === PAGE_SIZE ? PAGE_SIZE + 1 : firstRows.length);
    const pageCount = Math.min(MAX_PAGES, Math.ceil(total / PAGE_SIZE));

    const rest = await Promise.all(
      Array.from({ length: Math.max(0, pageCount - 1) }, (_, i) => fetchPage(i + 1)),
    );

    const seen = new Set<string>();
    const all: Customer[] = [];
    let failed = false;
    for (const res of [first, ...rest]) {
      if (res.error) {
        console.error('fetchCustomers page failed:', res.error.message);
        failed = true;
        continue;
      }
      for (const row of (res.data ?? []) as Customer[]) {
        if (!seen.has(row.id)) {
          seen.add(row.id);
          all.push(row);
        }
      }
    }

    // A failed later page would silently truncate the list — in that case
    // keep the previous (cached) list if we have one.
    if (!failed || customers.length === 0) {
      setCustomers(all);
      if (!failed) setCached(CACHE_KEY, all);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Any filter/sort/search change starts back at the first render chunk.
  useEffect(() => {
    setRenderLimit(RENDER_CHUNK);
  }, [statusFilter, typeFilter, activityFilter, sortKey, deferredSearch]);

  // Client-side STATUS filter (was DB-side pre-v2.15.0). Same semantics:
  // active = status 'active', banned = status 'banned',
  // warned = warning_count > 0 (regardless of status).
  const statusFiltered = useMemo(() => {
    if (statusFilter === 'active') return customers.filter((c) => c.status === 'active');
    if (statusFilter === 'banned') return customers.filter((c) => c.status === 'banned');
    if (statusFilter === 'warned') return customers.filter((c) => c.warning_count > 0);
    return customers;
  }, [customers, statusFilter]);

  // Compute counts for chip labels — based on the status-filtered set
  // (matches pre-v2.15.0 behaviour, when the DB applied the status filter
  // before these counts were computed).
  const counts = useMemo(() => {
    const now = Date.now();
    const inactiveCutoff = now - INACTIVE_DAYS * 86400_000;
    const newCutoff = now - NEW_DAYS * 86400_000;
    return {
      member: statusFiltered.filter((c) => c.membership === 'member').length,
      walkin: statusFiltered.filter((c) => c.membership !== 'member').length,
      local: statusFiltered.filter((c) => c.nationality === 'malaysian').length,
      foreign: statusFiltered.filter((c) => c.nationality === 'foreigner').length,
      frequent: statusFiltered.filter((c) => (c.visit_count ?? 0) >= FREQUENT_THRESHOLD).length,
      inactive: statusFiltered.filter((c) => {
        const lva = c.last_visit_at ? new Date(c.last_visit_at).getTime() : 0;
        return lva > 0 && lva < inactiveCutoff;
      }).length,
      new: statusFiltered.filter((c) => {
        const ca = c.created_at ? new Date(c.created_at).getTime() : 0;
        return ca > newCutoff;
      }).length,
    };
  }, [statusFiltered]);

  // Apply remaining filters + search + sort, all client-side.
  const visible = useMemo(() => {
    const now = Date.now();
    const inactiveCutoff = now - INACTIVE_DAYS * 86400_000;
    const newCutoff = now - NEW_DAYS * 86400_000;
    const s = deferredSearch.trim().toLowerCase();

    let out = statusFiltered.filter((c) => {
      // Type filter
      if (typeFilter === 'member' && c.membership !== 'member') return false;
      if (typeFilter === 'walkin' && c.membership === 'member') return false;
      if (typeFilter === 'local' && c.nationality !== 'malaysian') return false;
      if (typeFilter === 'foreign' && c.nationality !== 'foreigner') return false;

      // Activity filter
      if (activityFilter === 'frequent' && (c.visit_count ?? 0) < FREQUENT_THRESHOLD) return false;
      if (activityFilter === 'inactive') {
        const lva = c.last_visit_at ? new Date(c.last_visit_at).getTime() : 0;
        if (!(lva > 0 && lva < inactiveCutoff)) return false;
      }
      if (activityFilter === 'new') {
        const ca = c.created_at ? new Date(c.created_at).getTime() : 0;
        if (!(ca > newCutoff)) return false;
      }

      // Search
      if (s) {
        return (
          c.name.toLowerCase().includes(s) ||
          c.ic.toLowerCase().includes(s) ||
          c.phone.toLowerCase().includes(s)
        );
      }
      return true;
    });

    // Sort
    out = [...out].sort((a, b) => {
      switch (sortKey) {
        case 'visits_desc':
          return (b.visit_count ?? 0) - (a.visit_count ?? 0);
        case 'visits_asc':
          return (a.visit_count ?? 0) - (b.visit_count ?? 0);
        case 'last_visit_desc': {
          const av = a.last_visit_at ? new Date(a.last_visit_at).getTime() : 0;
          const bv = b.last_visit_at ? new Date(b.last_visit_at).getTime() : 0;
          return bv - av;
        }
        case 'last_visit_asc': {
          // Customers who never visited go LAST (we use Infinity as a sentinel)
          const av = a.last_visit_at ? new Date(a.last_visit_at).getTime() : Infinity;
          const bv = b.last_visit_at ? new Date(b.last_visit_at).getTime() : Infinity;
          return av - bv;
        }
        case 'name_asc':
          return a.name.localeCompare(b.name);
        case 'recent':
        default: {
          const av = a.created_at ? new Date(a.created_at).getTime() : 0;
          const bv = b.created_at ? new Date(b.created_at).getTime() : 0;
          return bv - av;
        }
      }
    });

    return out;
  }, [statusFiltered, typeFilter, activityFilter, deferredSearch, sortKey]);

  const statusFilters: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'ALL' },
    { key: 'active', label: 'ACTIVE' },
    { key: 'warned', label: 'WARNED' },
    { key: 'banned', label: 'BANNED' },
  ];

  // Grid columns: NAME · VISITS · LAST SEEN · IC · PHONE · STATUS
  const gridCols = '1fr 110px 120px 180px 160px 110px';

  return (
    <div className="dashboard-light min-h-screen">
      <div className="bg-white border-b border-neutral-200 px-4 md:px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <div>
            <p className="font-mono text-[10px] tracking-[0.3em] text-neutral-500 mb-1">// DATABASE</p>
            <h1 className="font-display text-3xl md:text-4xl tracking-tight">CUSTOMERS</h1>
          </div>
          {isAdmin && (
            <Link
              href="/admin/customers/new"
              className="font-display text-sm tracking-wider px-4 py-2.5 bg-accent text-ink hover:translate-y-0.5 transition-transform"
            >
              + NEW CUSTOMER
            </Link>
          )}
        </div>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="SEARCH BY NAME, IC, OR PHONE..."
          className="input-field font-mono text-sm mb-3"
        />

        {/* STATUS row */}
        <FilterRow label="STATUS">
          {statusFilters.map((f) => (
            <FilterChip
              key={f.key}
              active={statusFilter === f.key}
              onClick={() => setStatusFilter(f.key)}
            >
              {f.label}
            </FilterChip>
          ))}
        </FilterRow>

        {/* TYPE row */}
        <FilterRow label="TYPE">
          <FilterChip active={typeFilter === 'all'} onClick={() => setTypeFilter('all')}>
            ALL
          </FilterChip>
          <FilterChip active={typeFilter === 'member'} onClick={() => setTypeFilter('member')}>
            ⭐ MEMBER <Count n={counts.member} />
          </FilterChip>
          <FilterChip active={typeFilter === 'walkin'} onClick={() => setTypeFilter('walkin')}>
            WALK-IN <Count n={counts.walkin} />
          </FilterChip>
          <FilterChip active={typeFilter === 'local'} onClick={() => setTypeFilter('local')}>
            🇲🇾 LOCAL <Count n={counts.local} />
          </FilterChip>
          <FilterChip active={typeFilter === 'foreign'} onClick={() => setTypeFilter('foreign')}>
            🌍 FOREIGN <Count n={counts.foreign} />
          </FilterChip>
        </FilterRow>

        {/* ACTIVITY row */}
        <FilterRow label="ACTIVITY">
          <FilterChip active={activityFilter === 'all'} onClick={() => setActivityFilter('all')}>
            ALL
          </FilterChip>
          <FilterChip active={activityFilter === 'frequent'} onClick={() => setActivityFilter('frequent')}>
            🔥 FREQUENT (10+) <Count n={counts.frequent} />
          </FilterChip>
          <FilterChip active={activityFilter === 'inactive'} onClick={() => setActivityFilter('inactive')}>
            💤 INACTIVE (30d+) <Count n={counts.inactive} />
          </FilterChip>
          <FilterChip active={activityFilter === 'new'} onClick={() => setActivityFilter('new')}>
            ✨ NEW (this week) <Count n={counts.new} />
          </FilterChip>
        </FilterRow>

        {/* SORT row */}
        <FilterRow label="SORT BY">
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="font-mono text-[11px] tracking-wider px-3 py-1.5 border border-neutral-300 bg-white text-ink hover:border-accent cursor-pointer"
          >
            <option value="recent">RECENT (newest first)</option>
            <option value="visits_desc">VISITS · MOST FIRST 🔥</option>
            <option value="visits_asc">VISITS · LEAST FIRST</option>
            <option value="last_visit_desc">LAST VISIT · RECENT FIRST</option>
            <option value="last_visit_asc">LAST VISIT · OLDEST FIRST 💤</option>
            <option value="name_asc">NAME · A → Z</option>
          </select>
        </FilterRow>
      </div>

      {/* Desktop table header */}
      <div
        className="hidden md:grid bg-ink text-accent px-6 py-2 font-mono text-[10px] tracking-[0.15em] sticky top-0 z-10"
        style={{ gridTemplateColumns: gridCols }}
      >
        <div>NAME</div>
        <div>VISITS</div>
        <div>LAST SEEN</div>
        <div>IC / PASSPORT</div>
        <div>PHONE</div>
        <div className="text-center">STATUS</div>
      </div>

      {loading ? (
        <div className="text-center py-16 font-mono text-neutral-500">Loading...</div>
      ) : visible.length === 0 ? (
        <div className="text-center py-20">
          <p className="font-display text-2xl text-neutral-700">NO CUSTOMERS FOUND</p>
          <p className="font-mono text-xs text-neutral-500 mt-2">Try clearing some filters</p>
        </div>
      ) : (
        <>
          {visible.slice(0, renderLimit).map((c) => (
            <CustomerRow key={c.id} c={c} baseHref={baseHref} gridCols={gridCols} />
          ))}
          {visible.length > renderLimit && (
            <button
              onClick={() => setRenderLimit((l) => l + RENDER_CHUNK)}
              className="block w-full text-center font-display text-xs tracking-widest py-4 bg-white border-b border-neutral-200 hover:bg-yellow-50 transition-colors"
            >
              ▼ LOAD MORE · {visible.length - renderLimit} REMAINING
            </button>
          )}
          <div className="text-center font-mono text-xs text-neutral-500 py-4">
            {visible.length} of {customers.length} shown
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- Subcomponents ---------- */

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 flex-wrap items-center mb-2">
      <span className="font-mono text-[9px] tracking-[0.2em] text-neutral-500 font-bold min-w-[64px]">
        {label}
      </span>
      {children}
    </div>
  );
}

function FilterChip({
  active, onClick, children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`font-display text-[10px] tracking-widest px-3 py-1.5 border transition-colors ${
        active
          ? 'bg-ink text-bone border-ink'
          : 'bg-white text-ink border-neutral-300 hover:border-accent'
      }`}
    >
      {children}
    </button>
  );
}

function Count({ n }: { n: number }) {
  return <span className="text-accent font-normal ml-1">{n}</span>;
}

// Memoized: customer objects keep their identity across filter/sort
// recomputes, so unchanged rows skip re-rendering entirely.
const CustomerRow = memo(function CustomerRow({
  c, baseHref, gridCols,
}: {
  c: Customer;
  baseHref: string;
  gridCols: string;
}) {
  const visits = c.visit_count ?? 0;
  const lastSeen = formatLastSeen(c.last_visit_at ?? null);

  return (
    <Link href={`${baseHref}/${c.id}`}>
      <div
        className={`md:grid flex flex-col gap-1 items-center px-4 md:px-6 py-2.5 border-b border-neutral-200 cursor-pointer transition-colors ${
          c.status === 'banned'
            ? 'bg-red-50 hover:bg-red-100'
            : c.warning_count > 0
            ? 'bg-yellow-50 hover:bg-yellow-100'
            : 'bg-white hover:bg-yellow-50'
        }`}
        style={{ gridTemplateColumns: gridCols }}
      >
        {/* Mobile: stacked */}
        <div className="md:hidden w-full">
          <div className="flex items-center justify-between mb-1">
            <span className="font-bold text-sm truncate flex-1 flex items-center gap-1.5">
              {c.membership === 'member' && (
                <span className="font-display text-[9px] tracking-widest px-1.5 py-0.5 bg-success-green text-white flex-shrink-0">⭐</span>
              )}
              <GenderBadge gender={c.gender} />
              <span className="truncate">{c.name.toUpperCase()}</span>
            </span>
            <StatusBadge customer={c} />
          </div>
          <div className="font-mono text-[11px] text-neutral-600 truncate">
            {c.ic} · {c.phone}
          </div>
          <div className="font-mono text-[10px] text-neutral-500 mt-0.5">
            <span className="text-ink font-bold">{visits}</span> visit{visits === 1 ? '' : 's'}
            {lastSeen && <> · {lastSeen}</>}
          </div>
        </div>

        {/* Desktop: table cells */}
        <div className="hidden md:flex items-center gap-1.5 font-bold text-sm truncate">
          {c.nationality === 'foreigner' && <span className="text-accent">🌍</span>}
          {c.membership === 'member' && (
            <span className="font-display text-[9px] tracking-widest px-1.5 py-0.5 bg-success-green text-white flex-shrink-0">⭐ MEMBER</span>
          )}
          <GenderBadge gender={c.gender} />
          <span className="truncate">{c.name.toUpperCase()}</span>
        </div>
        <div className="hidden md:block font-mono text-sm">
          <span className="font-bold">{visits}</span>
          <span className="text-neutral-400 text-xs ml-1">{visits === 1 ? 'visit' : 'visits'}</span>
        </div>
        <div className="hidden md:block font-mono text-xs text-neutral-600 truncate">
          {lastSeen || <span className="text-neutral-400">—</span>}
        </div>
        <div className="hidden md:block font-mono text-xs text-neutral-600 truncate">{c.ic}</div>
        <div className="hidden md:block font-mono text-xs text-neutral-600 truncate">{c.phone}</div>
        <div className="hidden md:block text-center">
          <StatusBadge customer={c} />
        </div>
      </div>
    </Link>
  );
});

function StatusBadge({ customer }: { customer: Customer }) {
  if (customer.status === 'banned') {
    return (
      <span className="font-display text-[10px] tracking-widest px-2 py-1 bg-danger text-white">
        ✕ BANNED
      </span>
    );
  }
  if (customer.warning_count > 0) {
    return (
      <span className="font-display text-[10px] tracking-widest px-2 py-1 bg-accent text-ink">
        ⚠ {customer.warning_count}/3
      </span>
    );
  }
  return (
    <span className="font-display text-[10px] tracking-widest px-2 py-1 bg-success text-white">
      ✓ OK
    </span>
  );
}

/**
 * Format last_visit_at as a relative phrase: "today", "yesterday",
 * "3d ago", or "Jun 12" / "Jun 12, 2024" if older.
 */
function formatLastSeen(iso: string | null): string {
  if (!iso) return '';
  const then = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - then.getTime();
  const diffDays = Math.floor(diffMs / 86400_000);
  if (diffDays < 0) return 'just now';
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 30) return `${diffDays}d ago`;
  // Older than 30 days: show date
  const sameYear = then.getFullYear() === now.getFullYear();
  return then.toLocaleDateString('en-MY', sameYear
    ? { month: 'short', day: '2-digit', timeZone: 'Asia/Kuala_Lumpur' }
    : { year: 'numeric', month: 'short', day: '2-digit', timeZone: 'Asia/Kuala_Lumpur' }
  );
}

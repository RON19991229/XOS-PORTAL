'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-client';
import { formatDateTime } from '@/lib/utils';

interface Stats {
  totalCustomers: number;
  totalVisits: number;
  bannedCount: number;
  warnedCount: number;
  todayVisits: number;
  thisWeekVisits: number;
  thisMonthVisits: number;
  malaysianCount: number;
  foreignerCount: number;
}

interface DailyRow {
  date: string;
  approved: number;
  denied: number;
}

interface HourlyRow {
  hour: number;
  count: number;
}

export default function ReportsClient() {
  const supabase = createClient();
  const [stats, setStats] = useState<Stats | null>(null);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [hourly, setHourly] = useState<HourlyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const fetchAll = async () => {
    // Use 2 RPC calls instead of 10+ separate count queries.
    // ~10x faster: each COUNT was a full table scan; RPCs do a single pass.
    const [statsResp, trendsResp] = await Promise.all([
      supabase.rpc('get_dashboard_stats'),
      supabase.rpc('get_visit_trends', { days_back: 30 }),
    ]);

    if (statsResp.data) {
      const s = statsResp.data as Record<string, number>;
      setStats({
        totalCustomers: s.total_customers || 0,
        bannedCount: s.banned_count || 0,
        warnedCount: s.warned_count || 0,
        malaysianCount: s.malaysian_count || 0,
        foreignerCount: s.foreigner_count || 0,
        totalVisits: s.total_visits || 0,
        todayVisits: s.today_visits || 0,
        thisWeekVisits: s.this_week_visits || 0,
        thisMonthVisits: s.this_month_visits || 0,
      });
    }

    if (trendsResp.data) {
      const t = trendsResp.data as { daily?: Array<{ date_key: string; approved: number; denied: number }>; hourly?: Array<{ hour: number; count: number }> };

      const dailyArr: DailyRow[] = (t.daily || [])
        .map((d) => ({ date: d.date_key, approved: d.approved, denied: d.denied }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // Pad hourly to all 24 hours
      const hourMap: Record<number, number> = {};
      for (const h of t.hourly || []) hourMap[h.hour] = h.count;
      const hourlyArr: HourlyRow[] = Array.from({ length: 24 }, (_, h) => ({
        hour: h,
        count: hourMap[h] || 0,
      }));

      setDaily(dailyArr);
      setHourly(hourlyArr);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // v2.15.0: PostgREST caps every response at 1,000 rows project-wide, so
  // both exports below silently truncated once the data outgrew that
  // (customers passed 1,000 long ago — the CSV was missing 600+ records).
  // Fix: same paginated-loop pattern as CustomerList (stable sort + id
  // tie-breaker so rows can't be skipped or duplicated across pages).
  const EXPORT_PAGE = 1000;
  const EXPORT_MAX_PAGES = 50; // 50k-row safety cap

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fetchAllPages = async (buildQuery: (from: number, to: number) => any): Promise<any[]> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const all: any[] = [];
    for (let page = 0; page < EXPORT_MAX_PAGES; page++) {
      const from = page * EXPORT_PAGE;
      const { data, error } = await buildQuery(from, from + EXPORT_PAGE - 1);
      if (error || !data) break;
      all.push(...data);
      if (data.length < EXPORT_PAGE) break;
    }
    return all;
  };

  const exportCustomers = async () => {
    setExporting(true);
    const data = await fetchAllPages((from, to) =>
      supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to),
    );
    if (data.length > 0) {
      const headers = ['Name', 'Nationality', 'IC/Passport', 'Phone', 'DOB', 'Emergency Relationship', 'Emergency Phone', 'Guardian IC', 'Guardian Phone', 'Status', 'Warnings', 'Ban Reason', 'Created At'];
      const rows = data.map((c) => [
        c.name,
        c.nationality,
        c.ic,
        c.phone,
        c.dob || '',
        c.emergency_relationship || '',
        c.emergency_phone || '',
        c.guardian_ic || '',
        c.guardian_phone || '',
        c.status,
        c.warning_count,
        c.ban_reason || '',
        c.created_at,
      ]);
      downloadCSV('customers-export.csv', headers, rows);
    }
    setExporting(false);
  };

  const exportVisits = async () => {
    setExporting(true);
    // (the previous .limit(5000) never worked — PostgREST clamped it to
    // 1,000 anyway; the paginated loop now genuinely fetches everything
    // up to the 50k safety cap)
    const data = await fetchAllPages((from, to) =>
      supabase
        .from('visits')
        .select('*, customers(name, ic, phone)')
        .order('visited_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to),
    );

    if (data.length > 0) {
      const headers = ['Time', 'Name', 'IC/Passport', 'Phone', 'Status'];
      const rows = data.map((v) => [
        formatDateTime(v.visited_at),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (v as any).customers?.name || '',
        v.ic || '',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (v as any).customers?.phone || '',
        v.status,
      ]);
      downloadCSV('visits-export.csv', headers, rows);
    }
    setExporting(false);
  };

  const downloadCSV = (filename: string, headers: string[], rows: (string | number)[][]) => {
    const escape = (v: string | number) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const maxDaily = daily.length > 0 ? Math.max(...daily.map((d) => d.approved + d.denied), 1) : 1;
  const maxHourly = hourly.length > 0 ? Math.max(...hourly.map((h) => h.count), 1) : 1;

  if (loading) {
    return <div className="dashboard-light min-h-screen px-6 py-8 font-mono">Loading reports...</div>;
  }

  return (
    <div className="dashboard-light min-h-screen px-4 md:px-6 py-6 max-w-5xl mx-auto">
      <p className="font-mono text-[10px] tracking-[0.3em] text-neutral-500 mb-1">// ANALYTICS</p>
      <h1 className="font-display text-3xl md:text-4xl tracking-tight mb-1">REPORTS</h1>
      <div className="h-1 w-12 bg-accent mb-6" />

      {/* Top stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <StatCard label="TOTAL CUSTOMERS" value={stats.totalCustomers} />
          <StatCard label="TOTAL VISITS" value={stats.totalVisits} />
          <StatCard label="BANNED" value={stats.bannedCount} color="red" />
          <StatCard label="WARNED" value={stats.warnedCount} color="yellow" />
          <StatCard label="TODAY" value={stats.todayVisits} />
          <StatCard label="THIS WEEK" value={stats.thisWeekVisits} />
          <StatCard label="THIS MONTH" value={stats.thisMonthVisits} />
          <StatCard label="🇲🇾 / 🌍" value={`${stats.malaysianCount}/${stats.foreignerCount}`} />
        </div>
      )}

      {/* Daily chart */}
      <div className="bg-white border border-neutral-200 p-5 mb-6">
        <h2 className="font-display text-base tracking-widest mb-4">DAILY (LAST 30 DAYS)</h2>
        {daily.length === 0 ? (
          <p className="font-mono text-xs text-neutral-500">No visit data yet</p>
        ) : (
          <div className="space-y-1.5">
            {daily.slice(-14).map((d) => {
              const total = d.approved + d.denied;
              const pct = (total / maxDaily) * 100;
              return (
                <div key={d.date} className="flex items-center gap-3 text-sm">
                  <span className="font-mono text-xs w-20">{d.date}</span>
                  <div className="flex-1 h-5 bg-neutral-100 relative">
                    <div className="h-full bg-success" style={{ width: `${(d.approved / maxDaily) * 100}%` }} />
                    {d.denied > 0 && (
                      <div
                        className="h-full bg-danger absolute top-0"
                        style={{ left: `${(d.approved / maxDaily) * 100}%`, width: `${(d.denied / maxDaily) * 100}%` }}
                      />
                    )}
                  </div>
                  <span className="font-mono text-xs w-12 text-right">{total}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Hourly chart */}
      <div className="bg-white border border-neutral-200 p-5 mb-6">
        <h2 className="font-display text-base tracking-widest mb-4">HOURLY DISTRIBUTION (LAST 30 DAYS)</h2>
        {hourly.every((h) => h.count === 0) ? (
          <p className="font-mono text-xs text-neutral-500">No visit data yet</p>
        ) : (
          <div className="flex items-end gap-1 h-32">
            {hourly.map((h) => {
              const pct = (h.count / maxHourly) * 100;
              return (
                <div key={h.hour} className="flex-1 flex flex-col items-center justify-end">
                  <div className="w-full bg-accent" style={{ height: `${pct}%`, minHeight: h.count > 0 ? '2px' : '0' }} title={`${h.hour}:00 = ${h.count}`} />
                  <span className="font-mono text-[9px] mt-1 text-neutral-500">
                    {String(h.hour).padStart(2, '0')}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Exports */}
      <div className="bg-white border border-neutral-200 p-5">
        <h2 className="font-display text-base tracking-widest mb-4">EXPORT</h2>
        <div className="flex flex-wrap gap-3">
          <button onClick={exportCustomers} disabled={exporting} className="font-display text-sm tracking-wider px-4 py-2.5 bg-ink text-bone disabled:opacity-50">
            {exporting ? 'EXPORTING...' : '↓ CUSTOMERS CSV'}
          </button>
          <button onClick={exportVisits} disabled={exporting} className="font-display text-sm tracking-wider px-4 py-2.5 bg-ink text-bone disabled:opacity-50">
            {exporting ? 'EXPORTING...' : '↓ VISITS CSV (last 5000)'}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number | string; color?: 'red' | 'yellow' }) {
  const valueClass = color === 'red' ? 'text-danger' : color === 'yellow' ? 'text-yellow-600' : '';
  return (
    <div className="bg-white border border-neutral-200 p-3">
      <p className="font-mono text-[10px] tracking-widest text-neutral-500 mb-1">{label}</p>
      <p className={`font-display text-3xl ${valueClass}`}>{value}</p>
    </div>
  );
}

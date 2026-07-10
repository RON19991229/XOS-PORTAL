'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-client';
import { formatDateTime } from '@/lib/utils';

interface AuditEntry {
  id: string;
  user_id: string | null;
  user_name: string | null;
  action: string;
  customer_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export default function AuditClient() {
  const supabase = createClient();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'ban' | 'unban' | 'add_warning' | 'add_note' | 'reset_warnings'>('all');

  const fetchEntries = async () => {
    let query = supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(500);
    if (filter !== 'all') query = query.eq('action', filter);
    const { data } = await query;
    if (data) setEntries(data as AuditEntry[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const filters: { key: typeof filter; label: string }[] = [
    { key: 'all', label: 'ALL' },
    { key: 'ban', label: 'BANS' },
    { key: 'unban', label: 'UNBANS' },
    { key: 'add_warning', label: 'WARNINGS' },
    { key: 'reset_warnings', label: 'RESETS' },
    { key: 'add_note', label: 'NOTES' },
  ];

  const actionLabel = (a: string): string => {
    const map: Record<string, string> = {
      ban: 'BANNED',
      unban: 'UNBANNED',
      add_warning: 'WARNING ADDED',
      reset_warnings: 'WARNINGS RESET',
      add_note: 'NOTE ADDED',
    };
    return map[a] || a.toUpperCase();
  };

  const actionColor = (a: string): string => {
    if (a === 'ban') return 'bg-danger text-white';
    if (a === 'unban') return 'bg-success text-white';
    if (a === 'add_warning') return 'bg-accent text-ink';
    return 'bg-ink text-bone';
  };

  return (
    <div className="dashboard-light min-h-screen">
      <div className="bg-white border-b border-neutral-200 px-4 md:px-6 py-4">
        <p className="font-mono text-[10px] tracking-[0.3em] text-neutral-500 mb-1">// AUDIT TRAIL</p>
        <h1 className="font-display text-3xl md:text-4xl tracking-tight mb-3">AUDIT LOG</h1>

        <div className="flex gap-2 flex-wrap">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`font-display text-[10px] tracking-widest px-3 py-1.5 border ${
                filter === f.key ? 'bg-ink text-bone border-ink' : 'bg-white text-ink border-neutral-300 hover:border-accent'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 font-mono text-neutral-500">Loading...</div>
      ) : entries.length === 0 ? (
        <div className="text-center py-20">
          <p className="font-display text-2xl text-neutral-700">NO AUDIT ENTRIES</p>
          <p className="font-mono text-xs text-neutral-500 mt-2">Actions will appear here as they happen</p>
        </div>
      ) : (
        <div className="divide-y divide-neutral-200">
          {entries.map((e) => (
            <div key={e.id} className="px-4 md:px-6 py-3 bg-white hover:bg-yellow-50">
              <div className="flex items-start gap-3 flex-wrap">
                <span className={`font-display text-[10px] tracking-widest px-2 py-1 ${actionColor(e.action)} flex-shrink-0`}>
                  {actionLabel(e.action)}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-xs text-neutral-600 mb-1">
                    {formatDateTime(e.created_at)} · {e.user_name || 'Unknown'}
                  </p>
                  {e.customer_id && (
                    <Link
                      href={`/admin/customers/${e.customer_id}`}
                      className="font-mono text-xs underline underline-offset-4 text-ink"
                    >
                      VIEW CUSTOMER →
                    </Link>
                  )}
                  {e.details && Object.keys(e.details).length > 0 && (
                    <p className="font-mono text-xs text-neutral-700 mt-1 break-words">
                      {Object.entries(e.details)
                        .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
                        .join(' · ')}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

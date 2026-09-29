'use client';

/**
 * v2.22.0 — Ctrl+K customer search, available on every dashboard page.
 * Server-side search (name / IC / passport / phone), 8 results, ↑↓ + Enter.
 * Nothing is listed until something is typed, so opening it at the counter
 * doesn't put names on screen.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';

interface Result {
  id: string;
  name: string;
  ic: string;
  status: 'active' | 'banned';
  warning_count: number;
  membership: 'member' | null;
}

export default function CommandPalette({
  open, onClose, base,
}: {
  open: boolean;
  onClose: () => void;
  base: '/admin' | '/staff';
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (open) {
      setQ('');
      setResults([]);
      setActive(0);
      // Focus after the dialog has painted.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Debounced server search.
  useEffect(() => {
    if (!open) return;
    // Strip characters that have meaning in PostgREST filter syntax; the
    // value is then double-quoted so spaces and dots are safe.
    const term = q.replace(/[%,()*"\\]/g, ' ').replace(/\s+/g, ' ').trim();
    if (term.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    let cancelled = false;
    const timer = setTimeout(async () => {
      const digits = term.replace(/\D/g, '');
      const ors = [`name.ilike."%${term}%"`, `ic.ilike."%${term.replace(/\s/g, '')}%"`];
      if (digits.length >= 3) ors.push(`phone.ilike."%${digits}%"`);
      const { data } = await supabase
        .from('customers')
        .select('id, name, ic, status, warning_count, membership')
        .or(ors.join(','))
        .order('last_visit_at', { ascending: false, nullsFirst: false })
        .limit(8);
      if (cancelled) return;
      setResults((data ?? []) as Result[]);
      setActive(0);
      setSearching(false);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, open, supabase]);

  if (!open) return null;

  const go = (r: Result) => {
    onClose();
    router.push(`${base}/customers/${r.id}`);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && results[active]) {
      e.preventDefault();
      go(results[active]);
    }
  };

  const term = q.trim();

  return (
    <div
      className="fixed inset-0 z-[70] bg-ink/35 flex justify-center items-start px-4 pt-[12vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div role="dialog" aria-label="Find customer" className="w-full max-w-[640px] bg-white border border-line-strong shadow-[0_30px_80px_rgba(0,0,0,0.25)]">
        <div className="flex items-center gap-3 px-4 border-b border-line">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="text-muted flex-shrink-0">
            <path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.5-3.5" />
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type a name, IC, passport or phone…"
            aria-label="Search customers"
            autoComplete="off"
            className="flex-1 h-14 bg-transparent outline-none text-base"
          />
          <button type="button" onClick={onClose} className="font-mono text-[11px] border border-line-strong px-1.5 py-0.5 text-muted">
            ESC
          </button>
        </div>

        <div className="py-2 max-h-[60vh] overflow-y-auto">
          {term.length < 2 ? (
            <p className="px-4 py-3 text-sm text-muted">Start typing to search customers.</p>
          ) : searching && results.length === 0 ? (
            <p className="px-4 py-3 font-mono text-xs text-muted">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted">No customer matches “{term}”.</p>
          ) : (
            results.map((r, i) => (
              <button
                key={r.id}
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(r)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left ${i === active ? 'bg-[#fffbe0]' : ''}`}
              >
                <span
                  className={`w-2.5 h-2.5 flex-shrink-0 ${
                    r.status === 'banned' ? 'bg-danger' : r.warning_count > 0 ? 'bg-accent' : 'bg-success-green'
                  }`}
                />
                <span className="flex-1 min-w-0 truncate font-semibold text-sm">{r.name.toUpperCase()}</span>
                {r.status === 'banned' && <span className="font-mono text-[10px] font-bold tracking-widest text-danger">BANNED</span>}
                {r.status !== 'banned' && r.warning_count > 0 && (
                  <span className="font-mono text-[10px] font-bold tracking-widest text-[#8a6d00]">WARN {r.warning_count}/3</span>
                )}
                {r.membership === 'member' && <span className="font-mono text-[9px] font-bold tracking-widest bg-success-green px-1.5 py-0.5">MEMBER</span>}
                <span className="font-mono text-xs text-muted">{r.ic}</span>
              </button>
            ))
          )}
        </div>

        <div className="flex gap-5 px-4 py-2.5 border-t border-line font-mono text-[10px] tracking-[0.1em] text-muted">
          <span>↑↓ MOVE</span>
          <span>ENTER OPEN</span>
          <span>ESC CLOSE</span>
        </div>
      </div>
    </div>
  );
}

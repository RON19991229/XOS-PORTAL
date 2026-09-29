'use client';

/**
 * v2.22.0 — right-hand column used by TODAY and CUSTOMERS.
 *
 *   SideColumn    — on wide screens (xl+) a sticky column next to the list;
 *                   below that it becomes a slide-over drawer while open.
 *   CustomerPanel — quick customer summary (status, visits, warnings, IC,
 *                   phone, latest ban/warning/note) + OPEN FULL PROFILE.
 *                   Read-only, so it's safe on /staff.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-client';
import { formatDateTime } from '@/lib/utils';

export function SideColumn({
  open, onClose, children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  // Esc closes the panel (unless the Ctrl+K search is handling Esc itself).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-ink/30 xl:hidden" onClick={onClose} aria-hidden="true" />}
      <aside
        className={`${
          open ? 'fixed inset-y-0 right-0 z-50 w-[360px] max-w-[92vw] shadow-[-20px_0_50px_rgba(0,0,0,0.15)]' : 'hidden'
        } xl:block xl:static xl:z-auto xl:w-[340px] xl:max-w-none xl:shadow-none xl:sticky xl:top-16 xl:h-[calc(100vh-4rem)] flex-shrink-0 overflow-y-auto bg-paper border-l border-line`}
      >
        {children}
      </aside>
    </>
  );
}

interface PanelCustomer {
  id: string;
  name: string;
  ic: string;
  phone: string | null;
  nationality: 'malaysian' | 'foreigner' | string | null;
  status: 'active' | 'banned' | null;
  warning_count: number | null;
  ban_reason: string | null;
  banned_at?: string | null;
  membership: 'member' | null;
  visit_count?: number | null;
  last_visit_at?: string | null;
  photo_path?: string | null;
}

export type PanelSeed = Partial<PanelCustomer> & { id: string };

const PHOTO_BUCKET = 'attention-photos';
const SIGNED_URL_TTL = 60 * 60 * 6;
const photoUrlCache = new Map<string, string>();

export function CustomerPanel({
  seed, baseHref, onClose,
}: {
  seed: PanelSeed;
  baseHref: string;
  onClose: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [c, setC] = useState<Partial<PanelCustomer>>(seed);
  const [lastWarning, setLastWarning] = useState<string | null>(null);
  const [lastNote, setLastNote] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setC(seed);
    setLastWarning(null);
    setLastNote(null);
    setPhotoUrl(null);
    (async () => {
      const [cust, warn, note] = await Promise.all([
        supabase
          .from('customers')
          .select('id, name, ic, phone, nationality, status, warning_count, ban_reason, banned_at, membership, visit_count, last_visit_at, photo_path')
          .eq('id', seed.id)
          .maybeSingle(),
        supabase.from('warnings').select('reason').eq('customer_id', seed.id).order('created_at', { ascending: false }).limit(1),
        supabase.from('customer_notes').select('note').eq('customer_id', seed.id).order('created_at', { ascending: false }).limit(1),
      ]);
      if (!active) return;
      if (cust.data) setC(cust.data as PanelCustomer);
      setLastWarning(warn.data?.[0]?.reason ?? null);
      setLastNote(note.data?.[0]?.note ?? null);

      const path = (cust.data as PanelCustomer | null)?.photo_path;
      if (path) {
        const cached = photoUrlCache.get(path);
        if (cached) {
          setPhotoUrl(cached);
        } else {
          const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, SIGNED_URL_TTL);
          if (data?.signedUrl) {
            photoUrlCache.set(path, data.signedUrl);
            if (active) setPhotoUrl(data.signedUrl);
          }
        }
      }
    })();
    return () => {
      active = false;
    };
    // Re-fetch only when a different customer is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed.id, supabase]);

  const banned = c.status === 'banned';
  const warnings = c.warning_count ?? 0;
  const block = banned
    ? { bg: 'bg-danger text-white', tag: 'BANNED · DO NOT ADMIT' }
    : warnings > 0
    ? { bg: 'bg-accent text-ink', tag: `WARNING ${warnings}/3` }
    : { bg: 'bg-success-green text-ink', tag: 'ACTIVE' };

  return (
    <div className="p-5 flex flex-col gap-4 min-h-full">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] tracking-[0.25em] text-muted">CUSTOMER</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="w-9 h-9 grid place-items-center border border-line-strong bg-white text-lg hover:border-ink"
        >
          ×
        </button>
      </div>

      <div className={`p-4 ${block.bg}`}>
        <p className="font-mono text-[11px] font-bold tracking-[0.15em]">
          {block.tag}
          {c.membership === 'member' ? ' · MEMBER' : ''}
        </p>
        <p className="sens font-display text-[22px] leading-tight mt-1 break-words">{(c.name ?? '').toUpperCase()}</p>
      </div>

      {photoUrl && (
        <div className="sens bg-white border border-line">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoUrl} alt="Attention photo" className="w-full max-h-[220px] object-cover" />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        <div className="bg-white border border-line p-3">
          <p className="font-mono text-[9px] tracking-[0.2em] text-muted">VISITS</p>
          <p className="font-display text-2xl">{c.visit_count ?? '—'}</p>
        </div>
        <div className="bg-white border border-line p-3">
          <p className="font-mono text-[9px] tracking-[0.2em] text-muted">WARNINGS</p>
          <p className="font-display text-2xl">{warnings}/3</p>
        </div>
      </div>

      <dl className="flex flex-col gap-2 text-[13px]">
        <div className="flex justify-between gap-3">
          <dt className="text-muted">{c.nationality === 'foreigner' ? 'Passport' : 'IC'}</dt>
          <dd className="sens font-mono">{c.ic}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Phone</dt>
          <dd className="sens font-mono">{c.phone || '—'}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Last visit</dt>
          <dd>{c.last_visit_at ? formatDateTime(c.last_visit_at) : '—'}</dd>
        </div>
      </dl>

      {banned && c.ban_reason && (
        <div className="bg-white border border-line border-l-4 border-l-danger p-3 text-[13px] leading-relaxed">
          <p className="font-mono text-[9px] tracking-[0.2em] text-danger mb-1">BAN REASON</p>
          {c.ban_reason}
        </div>
      )}
      {!banned && lastWarning && (
        <div className="bg-white border border-line border-l-4 border-l-accent p-3 text-[13px] leading-relaxed">
          <p className="font-mono text-[9px] tracking-[0.2em] text-[#8a6d00] mb-1">LATEST WARNING</p>
          {lastWarning}
        </div>
      )}
      {lastNote && (
        <div className="bg-white border border-line p-3 text-[13px] leading-relaxed whitespace-pre-wrap">
          <p className="font-mono text-[9px] tracking-[0.2em] text-muted mb-1">LATEST NOTE</p>
          {lastNote}
        </div>
      )}

      <div className="flex-1" />
      <Link
        href={`${baseHref}/${seed.id}`}
        className="block text-center font-display text-[13px] tracking-[0.08em] py-3.5 bg-ink text-accent hover:bg-ink-soft"
      >
        OPEN FULL PROFILE →
      </Link>
    </div>
  );
}

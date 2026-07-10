'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-client';
import { Customer, Warning } from '@/lib/types';
import { formatDateTime } from '@/lib/utils';
import GenderBadge from './GenderBadge';

interface AttentionClientProps {
  baseHref: '/staff/customers' | '/admin/customers';
  role: 'staff' | 'admin';
  userId: string;
  userName: string;
}

const BUCKET = 'attention-photos';
const SIGNED_URL_TTL = 60 * 60 * 6; // 6h — comfortably covers a full shift
const MAX_DIM = 900;                // longest edge after compression (px)
const JPEG_QUALITY = 0.82;
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024; // reject absurd files before reading

type Filter = 'all' | 'banned' | 'warnings';

// ---------------------------------------------------------------------------
// Client-side image compression. Reads the chosen file, scales the longest
// edge down to MAX_DIM (keeping aspect ratio), and re-encodes as JPEG. Keeps
// the private bucket small and uploads fast on gym wifi / mobile data.
// ---------------------------------------------------------------------------
function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That file is not a valid image.'));
      img.onload = () => {
        let { width, height } = img;
        if (width >= height && width > MAX_DIM) {
          height = Math.round((height * MAX_DIM) / width);
          width = MAX_DIM;
        } else if (height > width && height > MAX_DIM) {
          width = Math.round((width * MAX_DIM) / height);
          height = MAX_DIM;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Your browser cannot process the image.'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('Could not compress the image.'))),
          'image/jpeg',
          JPEG_QUALITY,
        );
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export default function AttentionClient({ baseHref, role, userId, userName }: AttentionClientProps) {
  const supabase = createClient();
  const isAdmin = role === 'admin';

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [warningsByCustomer, setWarningsByCustomer] = useState<Record<string, Warning[]>>({});
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState('');

  // Single hidden file input, retargeted per card via a ref.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingCustomer = useRef<Customer | null>(null);

  // -------------------------------------------------------------------------
  // Load attention customers (banned OR warned), their warning history, and
  // signed URLs for any existing photos.
  // -------------------------------------------------------------------------
  const fetchData = async () => {
    setLoading(true);
    setLoadError('');

    const { data: custData, error: custErr } = await supabase
      .from('customers')
      .select('*')
      .or('status.eq.banned,warning_count.gt.0')
      .order('name', { ascending: true });

    if (custErr) {
      setLoadError('Could not load the attention list. Please refresh.');
      setCustomers([]);
      setLoading(false);
      return;
    }

    const list = (custData ?? []) as Customer[];
    setCustomers(list);

    // Warning history for these customers
    const ids = list.map((c) => c.id);
    if (ids.length > 0) {
      const { data: warnData } = await supabase
        .from('warnings')
        .select('*')
        .in('customer_id', ids)
        .order('created_at', { ascending: false });

      const grouped: Record<string, Warning[]> = {};
      (warnData ?? []).forEach((w) => {
        if (!w.customer_id) return;
        (grouped[w.customer_id] ||= []).push(w as Warning);
      });
      setWarningsByCustomer(grouped);
    } else {
      setWarningsByCustomer({});
    }

    // Signed URLs for photos (small set — one request per path is fine)
    const paths = list.map((c) => c.photo_path).filter(Boolean) as string[];
    if (paths.length > 0) {
      const entries = await Promise.all(
        paths.map(async (p) => {
          try {
            const { data } = await supabase.storage.from(BUCKET).createSignedUrl(p, SIGNED_URL_TTL);
            return [p, data?.signedUrl ?? ''] as const;
          } catch {
            return [p, ''] as const;
          }
        }),
      );
      const map: Record<string, string> = {};
      entries.forEach(([p, u]) => {
        if (u) map[p] = u;
      });
      setSignedUrls(map);
    } else {
      setSignedUrls({});
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------------------------------------------------------------------
  // Photo upload (admin only). Compress -> upsert into bucket at "<id>.jpg"
  // -> persist photo_path -> re-sign + cache-bust so the <img> refreshes.
  // -------------------------------------------------------------------------
  const handleFile = async (customer: Customer, file: File) => {
    setUploadError('');
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError('That file is too large. Please choose an image under 12 MB.');
      return;
    }
    setUploadingId(customer.id);
    try {
      const blob = await compressImage(file);
      const path = `${customer.id}.jpg`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
      if (upErr) throw upErr;

      if (customer.photo_path !== path) {
        const { error: dbErr } = await supabase
          .from('customers')
          .update({ photo_path: path })
          .eq('id', customer.id);
        if (dbErr) throw dbErr;
      }

      await supabase.from('audit_log').insert({
        user_id: userId,
        user_name: userName,
        action: 'attention_photo_upload',
        customer_id: customer.id,
        details: { path },
      });

      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL);
      setCustomers((prev) => prev.map((c) => (c.id === customer.id ? { ...c, photo_path: path } : c)));
      if (signed?.signedUrl) {
        const busted =
          signed.signedUrl + (signed.signedUrl.includes('?') ? '&' : '?') + 'v=' + Date.now();
        setSignedUrls((prev) => ({ ...prev, [path]: busted }));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Upload failed. Please try again.';
      setUploadError(msg);
    } finally {
      setUploadingId(null);
    }
  };

  const triggerUpload = (customer: Customer) => {
    if (!isAdmin) return;
    pendingCustomer.current = customer;
    fileInputRef.current?.click();
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const target = pendingCustomer.current;
    e.target.value = ''; // allow re-selecting the same file later
    if (file && target) handleFile(target, file);
    pendingCustomer.current = null;
  };

  // -------------------------------------------------------------------------
  // Derived lists
  // -------------------------------------------------------------------------
  const q = search.trim().toLowerCase();
  const matchesSearch = (c: Customer) =>
    !q ||
    c.name.toLowerCase().includes(q) ||
    c.ic.toLowerCase().includes(q) ||
    (c.phone ?? '').toLowerCase().includes(q);

  const banned = useMemo(
    () => customers.filter((c) => c.status === 'banned' && matchesSearch(c)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [customers, q],
  );
  // A banned customer is shown only in the banned section, even if they also
  // hold warnings — avoids the same face appearing twice.
  const warned = useMemo(
    () => customers.filter((c) => c.status !== 'banned' && (c.warning_count ?? 0) > 0 && matchesSearch(c)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [customers, q],
  );

  const bannedTotal = customers.filter((c) => c.status === 'banned').length;
  const warnedTotal = customers.filter((c) => c.status !== 'banned' && (c.warning_count ?? 0) > 0).length;

  const showBanned = filter === 'all' || filter === 'banned';
  const showWarnings = filter === 'all' || filter === 'warnings';

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="max-w-[1180px] mx-auto px-4 md:px-6 py-7 pb-24">
      {/* hidden upload input (admin only) */}
      {isAdmin && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={onInputChange}
          className="hidden"
        />
      )}

      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
        <div>
          <h1 className="font-display text-3xl md:text-4xl leading-none tracking-tight">
            ATTENTION <span className="text-accent">LIST</span>
          </h1>
          <p className="font-mono text-[11px] text-neutral-500 mt-2.5 max-w-xl leading-relaxed">
            // Banned &amp; warned customers. {isAdmin ? 'Upload a photo' : 'Photos'} so any
            staff on shift can recognise who must not enter and who to keep an eye on.
          </p>
        </div>
        <div className="flex gap-3">
          <div className="border border-ink-line bg-ink-soft px-4 py-2.5 min-w-[92px]">
            <div className="font-display text-2xl leading-none text-danger">{bannedTotal}</div>
            <div className="font-mono text-[10px] tracking-widest text-neutral-500 mt-1">BANNED</div>
          </div>
          <div className="border border-ink-line bg-ink-soft px-4 py-2.5 min-w-[92px]">
            <div className="font-display text-2xl leading-none text-accent">{warnedTotal}</div>
            <div className="font-mono text-[10px] tracking-widest text-neutral-500 mt-1">WARNINGS</div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-3 flex-wrap items-center mb-7">
        <div className="flex border border-ink-line">
          {(['all', 'banned', 'warnings'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`font-display text-xs tracking-widest px-4 py-2.5 transition-colors ${
                filter === f ? 'bg-bone text-ink' : 'text-neutral-400 hover:text-accent'
              }`}
            >
              {f.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="flex-1 min-w-[220px] flex items-center gap-2.5 border border-ink-line bg-ink-soft px-3.5 py-2.5">
          <span className="font-mono text-neutral-500">⌕</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search name / IC / phone…"
            className="flex-1 bg-transparent outline-none text-bone font-mono text-[13px] placeholder:text-neutral-600"
          />
        </div>
      </div>

      {uploadError && (
        <div className="mb-5 border border-danger/50 bg-danger/10 text-danger font-mono text-xs px-4 py-3">
          {uploadError}
        </div>
      )}

      {/* States */}
      {loading ? (
        <div className="font-mono text-sm text-neutral-500 py-16 text-center">Loading…</div>
      ) : loadError ? (
        <div className="font-mono text-sm text-danger py-16 text-center">{loadError}</div>
      ) : bannedTotal === 0 && warnedTotal === 0 ? (
        <div className="border border-dashed border-ink-line bg-ink-soft py-16 text-center">
          <div className="font-display text-lg text-neutral-400">ALL CLEAR</div>
          <div className="font-mono text-xs text-neutral-600 mt-2">
            No banned or warned customers right now.
          </div>
        </div>
      ) : (
        <>
          {/* BANNED */}
          {showBanned && (
            <section className="mb-10">
              <div className="flex items-center gap-3 mb-4">
                <span className="font-display text-sm tracking-[0.18em] bg-danger text-white px-3.5 py-1.5">
                  BANNED — NO ENTRY
                </span>
                <span className="flex-1 h-px bg-ink-line" />
                <span className="font-mono text-xs text-neutral-500">{banned.length} shown</span>
              </div>
              {banned.length === 0 ? (
                <p className="font-mono text-xs text-neutral-600 py-2">No matches.</p>
              ) : (
                <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
                  {banned.map((c) => (
                    <AttentionCard
                      key={c.id}
                      customer={c}
                      kind="banned"
                      warnings={warningsByCustomer[c.id] ?? []}
                      photoUrl={c.photo_path ? signedUrls[c.photo_path] : undefined}
                      isAdmin={isAdmin}
                      uploading={uploadingId === c.id}
                      onUpload={() => triggerUpload(c)}
                      detailHref={`${baseHref}/${c.id}`}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* WARNINGS */}
          {showWarnings && (
            <section className="mb-10">
              <div className="flex items-center gap-3 mb-4">
                <span className="font-display text-sm tracking-[0.18em] bg-accent text-ink px-3.5 py-1.5">
                  WARNINGS — WATCH
                </span>
                <span className="flex-1 h-px bg-ink-line" />
                <span className="font-mono text-xs text-neutral-500">{warned.length} shown</span>
              </div>
              {warned.length === 0 ? (
                <p className="font-mono text-xs text-neutral-600 py-2">No matches.</p>
              ) : (
                <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
                  {warned.map((c) => (
                    <AttentionCard
                      key={c.id}
                      customer={c}
                      kind="warn"
                      warnings={warningsByCustomer[c.id] ?? []}
                      photoUrl={c.photo_path ? signedUrls[c.photo_path] : undefined}
                      isAdmin={isAdmin}
                      uploading={uploadingId === c.id}
                      onUpload={() => triggerUpload(c)}
                      detailHref={`${baseHref}/${c.id}`}
                    />
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

// ===========================================================================
// Card
// ===========================================================================
interface CardProps {
  customer: Customer;
  kind: 'banned' | 'warn';
  warnings: Warning[];
  photoUrl?: string;
  isAdmin: boolean;
  uploading: boolean;
  onUpload: () => void;
  detailHref: string;
}

function AttentionCard({
  customer: c,
  kind,
  warnings,
  photoUrl,
  isAdmin,
  uploading,
  onUpload,
  detailHref,
}: CardProps) {
  const accentBorder = kind === 'banned' ? 'border-l-danger' : 'border-l-accent';
  const hasPhoto = !!c.photo_path;
  const icLabel = c.nationality === 'foreigner' ? `PASSPORT · ${c.ic}` : c.ic;

  // ---- Photo column ----
  const photoColumn = (() => {
    if (hasPhoto && photoUrl) {
      return (
        <div className="relative w-[118px] min-w-[118px] bg-[#0d0d0d] border-r border-ink-line">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoUrl} alt={c.name} className="w-full h-full object-cover" />
          {isAdmin && (
            <button
              onClick={onUpload}
              disabled={uploading}
              className="absolute bottom-0 left-0 right-0 font-mono text-[9px] tracking-wider text-center py-1.5 bg-black/70 text-accent hover:bg-black/85 disabled:opacity-60"
            >
              {uploading ? 'UPLOADING…' : 'REPLACE PHOTO'}
            </button>
          )}
        </div>
      );
    }
    if (hasPhoto && !photoUrl) {
      // path set but signed URL unavailable (file missing / link error)
      return (
        <div className="w-[118px] min-w-[118px] bg-[#0d0d0d] border-r border-ink-line flex items-center justify-center text-center px-2">
          <span className="font-mono text-[9px] text-neutral-600">PHOTO UNAVAILABLE</span>
        </div>
      );
    }
    if (isAdmin) {
      return (
        <button
          onClick={onUpload}
          disabled={uploading}
          className="w-[118px] min-w-[118px] border-r border-dashed border-neutral-700 bg-[#0d0d0d] flex flex-col items-center justify-center gap-1.5 text-neutral-500 hover:text-accent hover:bg-[#121212] transition-colors disabled:opacity-60"
        >
          <span className="font-display text-2xl leading-none">{uploading ? '…' : '+'}</span>
          <span className="font-mono text-[9px] tracking-wider">
            {uploading ? 'UPLOADING' : 'ADD PHOTO'}
          </span>
        </button>
      );
    }
    return (
      <div className="w-[118px] min-w-[118px] border-r border-ink-line bg-[#0d0d0d] flex items-center justify-center">
        <span className="font-mono text-[9px] text-neutral-600">NO PHOTO</span>
      </div>
    );
  })();

  return (
    <div className={`flex bg-ink-soft border border-ink-line border-l-4 ${accentBorder} overflow-hidden`}>
      {photoColumn}

      <div className="flex-1 p-4 flex flex-col min-w-0">
        <div className="flex items-start gap-2">
          <Link
            href={detailHref}
            className="font-display text-[17px] leading-tight tracking-tight break-words hover:text-accent transition-colors"
          >
            {c.name}
          </Link>
          <span className="mt-0.5">
            <GenderBadge gender={c.gender} />
          </span>
        </div>
        <div className="font-mono text-xs text-neutral-400 mt-1.5">{icLabel}</div>

        {/* Badges */}
        <div className="flex gap-1.5 mt-2.5 flex-wrap">
          {kind === 'banned' ? (
            <span className="font-mono text-[10px] tracking-wider px-1.5 py-0.5 rounded-sm bg-danger/15 text-danger border border-danger/40">
              BANNED
            </span>
          ) : (
            <span
              className={`font-mono text-[10px] tracking-wider px-1.5 py-0.5 rounded-sm border ${
                (c.warning_count ?? 0) >= 3
                  ? 'bg-danger/15 text-danger border-danger/40'
                  : 'bg-accent/15 text-accent border-accent/40'
              }`}
            >
              ⚠ {c.warning_count ?? 0} / 3
            </span>
          )}
          {c.membership === 'member' && (
            <span className="font-mono text-[10px] tracking-wider px-1.5 py-0.5 rounded-sm bg-success-green/15 text-success-green border border-success-green/40">
              ★ MEMBER
            </span>
          )}
        </div>

        {/* Reason / history */}
        <div className="mt-3 pt-3 border-t border-dashed border-ink-line">
          {kind === 'banned' ? (
            <>
              <div className="font-mono text-[9px] tracking-widest text-neutral-500">BAN REASON</div>
              <div className="font-body text-[13px] text-neutral-200 mt-1 leading-snug">
                {c.ban_reason || '—'}
              </div>
              {c.banned_at && (
                <div className="font-mono text-[10px] text-neutral-500 mt-1.5">
                  SINCE {formatDateTime(c.banned_at)}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="font-mono text-[9px] tracking-widest text-neutral-500">
                WARNING HISTORY
              </div>
              {warnings.length === 0 ? (
                <div className="font-body text-[13px] text-neutral-400 mt-1">
                  {c.warning_count ?? 0} warning(s) on record.
                </div>
              ) : (
                <ul className="mt-1 space-y-0.5">
                  {warnings.map((w) => (
                    <li key={w.id} className="font-body text-[12.5px] text-neutral-200 flex gap-2 leading-snug">
                      <span className="text-accent font-bold">›</span>
                      <span className="min-w-0">
                        {w.reason}
                        <span className="text-neutral-500"> — {formatDateTime(w.created_at)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="mt-auto pt-3">
          <Link
            href={detailHref}
            className="inline-block font-display text-[10px] tracking-wider px-2.5 py-1.5 border border-ink-line text-neutral-300 hover:border-accent hover:text-accent transition-colors"
          >
            OPEN FILE →
          </Link>
        </div>
      </div>
    </div>
  );
}

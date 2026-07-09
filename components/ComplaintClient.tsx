'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase-client';
import { IncidentReport, IncidentStatus } from '@/lib/types';
import { StoredAnswer, QID } from '@/lib/report-config';
import { formatDateTime } from '@/lib/utils';

interface ComplaintClientProps {
  role: 'staff' | 'admin';
  userId: string;
  userName: string;
}

const BUCKET = 'incident-photos';
const SIGNED_URL_TTL = 60 * 60 * 6; // 6h

type Filter = 'all' | IncidentStatus;

const STATUS_META: Record<IncidentStatus, { label: string; cls: string; leftBorder: string }> = {
  new: { label: 'NEW', cls: 'bg-danger text-white', leftBorder: 'border-l-danger' },
  reviewing: { label: 'REVIEWING', cls: 'bg-[#c48f00] text-white', leftBorder: 'border-l-[#e0a800]' },
  resolved: { label: 'RESOLVED', cls: 'bg-success-green text-white', leftBorder: 'border-l-success-green' },
};

function asAnswers(a: unknown): StoredAnswer[] {
  return Array.isArray(a) ? (a as StoredAnswer[]) : [];
}

export default function ComplaintClient({ role, userId, userName }: ComplaintClientProps) {
  const supabase = createClient();
  const isAdmin = role === 'admin';

  const [reports, setReports] = useState<IncidentReport[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  const fetchData = async () => {
    setLoading(true);
    setLoadError('');
    const { data, error } = await supabase
      .from('incident_reports')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      setLoadError('Could not load complaints. Please refresh.');
      setReports([]);
      setLoading(false);
      return;
    }

    const list = (data ?? []) as IncidentReport[];
    setReports(list);

    const paths = list.map((r) => r.photo_path).filter(Boolean) as string[];
    if (paths.length > 0) {
      const entries = await Promise.all(
        paths.map(async (p) => {
          try {
            const { data: s } = await supabase.storage.from(BUCKET).createSignedUrl(p, SIGNED_URL_TTL);
            return [p, s?.signedUrl ?? ''] as const;
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

  const setStatus = async (r: IncidentReport, status: IncidentStatus) => {
    if (!isAdmin || r.status === status) return;
    setBusyId(r.id);
    setActionError('');
    const { error } = await supabase
      .from('incident_reports')
      .update({ status, reviewed_by: userId, reviewed_at: new Date().toISOString() })
      .eq('id', r.id);
    if (error) {
      setActionError('Could not update status. Please try again.');
      setBusyId(null);
      return;
    }
    await supabase.from('audit_log').insert({
      user_id: userId,
      user_name: userName,
      action: 'complaint_status_change',
      customer_id: null,
      details: { report_id: r.id, status },
    });
    setReports((prev) => prev.map((x) => (x.id === r.id ? { ...x, status } : x)));
    setBusyId(null);
  };

  const remove = async (r: IncidentReport) => {
    if (!isAdmin) return;
    if (typeof window !== 'undefined' && !window.confirm('Delete this complaint permanently? This cannot be undone.')) {
      return;
    }
    setBusyId(r.id);
    setActionError('');
    if (r.photo_path) {
      try {
        await supabase.storage.from(BUCKET).remove([r.photo_path]);
      } catch {
        /* non-fatal */
      }
    }
    const { error } = await supabase.from('incident_reports').delete().eq('id', r.id);
    if (error) {
      setActionError('Could not delete. Please try again.');
      setBusyId(null);
      return;
    }
    await supabase.from('audit_log').insert({
      user_id: userId,
      user_name: userName,
      action: 'complaint_delete',
      customer_id: null,
      details: { report_id: r.id },
    });
    setReports((prev) => prev.filter((x) => x.id !== r.id));
    setBusyId(null);
  };

  const counts = useMemo(() => {
    const c = { all: reports.length, new: 0, reviewing: 0, resolved: 0 };
    reports.forEach((r) => {
      c[r.status] += 1;
    });
    return c;
  }, [reports]);

  const shown = filter === 'all' ? reports : reports.filter((r) => r.status === filter);

  return (
    <div className="dashboard-light min-h-screen px-4 md:px-6 py-6 max-w-5xl mx-auto pb-24">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
        <div>
          <h1 className="font-display text-3xl md:text-4xl leading-none tracking-tight text-ink">
            COMPLAINTS
          </h1>
          <p className="font-mono text-[11px] text-neutral-500 mt-2.5 max-w-xl leading-relaxed">
            // Harassment / misconduct reports submitted by members. Confidential —
            {isAdmin ? ' review, update status, and remove.' : ' read-only for staff.'}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap mb-6">
        {(['all', 'new', 'reviewing', 'resolved'] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`font-display text-[11px] tracking-widest px-4 py-2.5 border-2 transition-colors rounded ${
              filter === f
                ? 'bg-ink text-bone border-ink'
                : 'bg-white text-neutral-500 border-neutral-200 hover:border-neutral-400'
            }`}
          >
            {f.toUpperCase()} · {counts[f]}
          </button>
        ))}
      </div>

      {actionError && (
        <div className="mb-5 border border-danger/50 bg-danger/10 text-danger font-mono text-xs px-4 py-3 rounded">
          {actionError}
        </div>
      )}

      {loading ? (
        <div className="font-mono text-sm text-neutral-500 py-16 text-center">Loading…</div>
      ) : loadError ? (
        <div className="font-mono text-sm text-danger py-16 text-center">{loadError}</div>
      ) : shown.length === 0 ? (
        <div className="border border-dashed border-neutral-300 bg-neutral-50 py-16 text-center rounded-lg">
          <div className="font-display text-lg text-neutral-400">
            {filter === 'all' ? 'NO COMPLAINTS' : `NO ${filter.toUpperCase()} COMPLAINTS`}
          </div>
          <div className="font-mono text-xs text-neutral-400 mt-2">
            {filter === 'all' ? 'Nothing has been reported yet.' : 'Try another filter.'}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {shown.map((r) => (
            <ComplaintCard
              key={r.id}
              report={r}
              photoUrl={r.photo_path ? signedUrls[r.photo_path] : undefined}
              isAdmin={isAdmin}
              busy={busyId === r.id}
              onStatus={(s) => setStatus(r, s)}
              onDelete={() => remove(r)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// Card
// ===========================================================================
interface CardProps {
  report: IncidentReport;
  photoUrl?: string;
  isAdmin: boolean;
  busy: boolean;
  onStatus: (s: IncidentStatus) => void;
  onDelete: () => void;
}

function ComplaintCard({ report: r, photoUrl, isAdmin, busy, onStatus, onDelete }: CardProps) {
  const answers = asAnswers(r.answers);
  const meta = STATUS_META[r.status];

  const locationAns = answers.find((a) => a.qid === QID.location);
  const locationParts: string[] = [];
  if (locationAns) {
    if (Array.isArray(locationAns.value)) locationParts.push(...locationAns.value);
    if (locationAns.other) locationParts.push(locationAns.other);
  }

  // Everything except description(what_happened) & location & textareas -> tags
  const tagAnswers = answers.filter(
    (a) => a.qid !== QID.whatHappened && a.qid !== QID.location && a.type !== 'textarea',
  );
  const blockAnswers = answers.filter(
    (a) => a.qid !== QID.whatHappened && a.type === 'textarea',
  );

  const contactLine = r.reporter_contact
    ? r.reporter_name
      ? `${r.reporter_name} · ${r.reporter_contact}`
      : r.reporter_contact
    : r.reporter_name
      ? `${r.reporter_name} (no contact)`
      : 'submitted anonymously';

  return (
    <div className={`bg-white border border-neutral-200 border-l-[5px] ${meta.leftBorder} rounded-lg p-4 flex gap-4`}>
      {/* photo */}
      <div className="w-[92px] min-w-[92px] h-[92px] bg-neutral-900 rounded-lg overflow-hidden flex items-center justify-center">
        {r.photo_path && photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="evidence" className="w-full h-full object-cover" />
        ) : r.photo_path ? (
          <span className="font-mono text-[8px] text-neutral-500 text-center px-1">PHOTO<br />UNAVAILABLE</span>
        ) : (
          <span className="font-mono text-[9px] text-neutral-600 text-center">NO<br />PHOTO</span>
        )}
      </div>

      {/* body */}
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-start gap-3 flex-wrap mb-2">
          <span className="font-mono text-[11px] text-neutral-500">
            {formatDateTime(r.created_at)} · {contactLine}
          </span>
          <span className={`font-display text-[9px] tracking-wider px-2 py-1 rounded ${meta.cls}`}>
            {meta.label}
          </span>
        </div>

        {locationParts.length > 0 && (
          <div className="font-mono text-[11px] text-danger tracking-tight mb-2">
            ⚑ {locationParts.join(' · ').toUpperCase()}
          </div>
        )}

        <p className="text-[14px] text-neutral-800 leading-relaxed whitespace-pre-wrap mb-3">
          {r.description}
        </p>

        {tagAnswers.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {tagAnswers.map((a) => (
              <span key={a.qid} className="font-mono text-[10px] bg-neutral-100 text-neutral-600 px-2 py-1 rounded">
                {a.label}: {Array.isArray(a.value) ? a.value.join(', ') : a.value}
              </span>
            ))}
            {r.photo_path && (
              <span className="font-mono text-[10px] bg-neutral-100 text-neutral-600 px-2 py-1 rounded">📷 photo</span>
            )}
          </div>
        )}

        {blockAnswers.map((a) => (
          <div key={a.qid} className="mb-2">
            <div className="font-mono text-[9px] tracking-widest text-neutral-400 uppercase">{a.label}</div>
            <div className="text-[13px] text-neutral-700 leading-snug whitespace-pre-wrap">
              {Array.isArray(a.value) ? a.value.join(', ') : a.value}
            </div>
          </div>
        ))}

        {/* actions (admin only) */}
        {isAdmin && (
          <div className="flex gap-2 flex-wrap mt-3 pt-3 border-t border-dashed border-neutral-200">
            {r.status !== 'reviewing' && r.status !== 'resolved' && (
              <button
                onClick={() => onStatus('reviewing')}
                disabled={busy}
                className="font-display text-[10px] tracking-wider px-3 py-2 border-2 border-[#e0a800] text-[#a67c00] rounded hover:bg-[#e0a800]/10 disabled:opacity-50"
              >
                MARK REVIEWING
              </button>
            )}
            {r.status !== 'resolved' && (
              <button
                onClick={() => onStatus('resolved')}
                disabled={busy}
                className="font-display text-[10px] tracking-wider px-3 py-2 border-2 border-success-green text-[#0a9c47] rounded hover:bg-success-green/10 disabled:opacity-50"
              >
                MARK RESOLVED
              </button>
            )}
            {r.status !== 'new' && (
              <button
                onClick={() => onStatus('new')}
                disabled={busy}
                className="font-display text-[10px] tracking-wider px-3 py-2 border-2 border-neutral-300 text-neutral-500 rounded hover:bg-neutral-100 disabled:opacity-50"
              >
                REOPEN
              </button>
            )}
            <button
              onClick={onDelete}
              disabled={busy}
              className="font-display text-[10px] tracking-wider px-3 py-2 border-2 border-danger text-danger rounded hover:bg-danger/10 disabled:opacity-50 ml-auto"
            >
              DELETE
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

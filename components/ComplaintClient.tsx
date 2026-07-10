'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase-client';
import { IncidentReport, IncidentStatus, IncidentNote } from '@/lib/types';
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
  // Mirror of signedUrls for synchronous reads inside fetchData (avoids
  // re-signing paths that are already cached). Kept in sync on every set.
  const signedUrlsRef = useRef<Record<string, string>>({});
  const [notesByReport, setNotesByReport] = useState<Record<string, IncidentNote[]>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  const fetchData = async (silent = false) => {
    if (!silent) setLoading(true);
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

    // Fetch the internal case-log notes for all reports in one query.
    const ids = list.map((r) => r.id);
    if (ids.length > 0) {
      const { data: notes } = await supabase
        .from('incident_notes')
        .select('*')
        .in('report_id', ids)
        .order('created_at', { ascending: true });
      const nmap: Record<string, IncidentNote[]> = {};
      ((notes ?? []) as IncidentNote[]).forEach((n) => {
        (nmap[n.report_id] ??= []).push(n);
      });
      setNotesByReport(nmap);
    } else {
      setNotesByReport({});
    }

    // v2.15.0: only sign paths we haven't signed yet in this session.
    // Previously EVERY refresh (including every tab focus) re-signed every
    // photo — the URL token changed, so the browser treated each image as
    // brand new and re-downloaded all evidence photos, causing a visible
    // flash. The 6h TTL comfortably outlives any admin session, so cached
    // URLs stay valid; new reports still get signed immediately.
    const paths = list.map((r) => r.photo_path).filter(Boolean) as string[];
    const needed = paths.filter((p) => !signedUrlsRef.current[p]);
    if (needed.length > 0) {
      const entries = await Promise.all(
        needed.map(async (p) => {
          try {
            const { data: s } = await supabase.storage.from(BUCKET).createSignedUrl(p, SIGNED_URL_TTL);
            return [p, s?.signedUrl ?? ''] as const;
          } catch {
            return [p, ''] as const;
          }
        }),
      );
      const fresh: Record<string, string> = {};
      entries.forEach(([p, u]) => {
        if (u) fresh[p] = u;
      });
      if (Object.keys(fresh).length > 0) {
        setSignedUrls((prev) => {
          const next = { ...prev, ...fresh };
          signedUrlsRef.current = next;
          return next;
        });
      }
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchData(true);
    };
    const onFocus = () => fetchData(true);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
    };
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

  const addNote = async (reportId: string, text: string): Promise<boolean> => {
    if (!isAdmin) return false;
    const note = text.trim();
    if (!note) return false;
    setActionError('');
    const { data, error } = await supabase
      .from('incident_notes')
      .insert({ report_id: reportId, note, added_by: userId, added_by_name: userName })
      .select('*')
      .single();
    if (error || !data) {
      setActionError('Could not add note. Please try again.');
      return false;
    }
    await supabase.from('audit_log').insert({
      user_id: userId,
      user_name: userName,
      action: 'complaint_note_add',
      customer_id: null,
      details: { report_id: reportId },
    });
    setNotesByReport((prev) => ({
      ...prev,
      [reportId]: [...(prev[reportId] ?? []), data as IncidentNote],
    }));
    return true;
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
              notes={notesByReport[r.id] ?? []}
              isAdmin={isAdmin}
              busy={busyId === r.id}
              onStatus={(s) => setStatus(r, s)}
              onDelete={() => remove(r)}
              onAddNote={addNote}
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
  notes: IncidentNote[];
  isAdmin: boolean;
  busy: boolean;
  onStatus: (s: IncidentStatus) => void;
  onDelete: () => void;
  onAddNote: (reportId: string, text: string) => Promise<boolean>;
}

// ---------------------------------------------------------------------------
// v2.15.0: KV and SecHead moved OUT of ComplaintCard. Defining components
// inside another component's body creates a brand-new component type on
// every render, which forces React to unmount + remount every cell — e.g.
// each keystroke in the case-log note input used to tear down and rebuild
// the whole identikit grid. At module scope their identity is stable and
// React can diff them normally. Markup is unchanged.
// ---------------------------------------------------------------------------

// Small label-over-value cell for the definition grids.
function KV({
  k,
  v,
  hot,
  wide,
  soft,
}: {
  k: string;
  v: string;
  hot?: boolean;
  wide?: boolean;
  soft?: boolean;
}) {
  return (
    <div className={wide ? 'col-span-full' : ''}>
      <div className="font-mono text-[8.5px] tracking-[0.14em] text-neutral-400 uppercase mb-0.5">{k}</div>
      <div
        className={`text-[13.5px] leading-snug ${soft ? 'font-semibold text-neutral-700 whitespace-pre-wrap' : 'font-bold'} ${
          hot ? 'text-danger' : 'text-neutral-900'
        }`}
      >
        {v}
      </div>
    </div>
  );
}

function SecHead({ dot, title }: { dot: string; title: string }) {
  return (
    <div className="flex items-center gap-2 font-display text-[10px] tracking-[0.16em] text-neutral-500 mb-3">
      <span className="w-[7px] h-[7px] rounded-[2px]" style={{ background: dot }} />
      {title}
    </div>
  );
}

function ComplaintCard({
  report: r,
  photoUrl,
  notes,
  isAdmin,
  busy,
  onStatus,
  onDelete,
  onAddNote,
}: CardProps) {
  const answers = asAnswers(r.answers);
  const meta = STATUS_META[r.status];

  const [noteInput, setNoteInput] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  // -------------------------------------------------------------------------
  // Answer lookup & formatting (v2.14.1 redesign)
  // Answers are self-describing ({qid,label,type,value,other}) so old reports
  // (v2.11–2.13) and any future config questions keep rendering: known qids
  // get a fixed slot below, unknown ones fall through to the FOLLOW-UP row.
  // -------------------------------------------------------------------------
  const byQid = new Map(answers.map((a) => [a.qid, a]));
  const get = (qid: string) => byQid.get(qid);
  const val = (a?: StoredAnswer): string => {
    if (!a) return '';
    const v = Array.isArray(a.value) ? a.value.join(' · ') : a.value;
    return a.other ? `${v} — ${a.other}` : v;
  };

  const urgencyAns = get(QID.urgency);
  const isUrgent = urgencyAns?.value === 'Happening now';

  const locationAns = get(QID.location);
  const locationParts: string[] = [];
  if (locationAns) {
    if (Array.isArray(locationAns.value)) locationParts.push(...locationAns.value);
    if (locationAns.other) locationParts.push(locationAns.other);
  }

  // "When" = date + time merged into one slot ("10 Jul 2026 · ~16:38").
  const dateAns = get('incident_date');
  const timeAns = get('incident_time');
  const whenParts: string[] = [];
  if (dateAns && typeof dateAns.value === 'string' && dateAns.value) {
    const d = new Date(`${dateAns.value}T00:00:00`);
    whenParts.push(
      isNaN(d.getTime())
        ? dateAns.value
        : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    );
  }
  if (timeAns && typeof timeAns.value === 'string' && timeAns.value) {
    whenParts.push(`~${timeAns.value}`);
  }

  // "Hair" = colour + length merged ("Black · Short").
  const hairParts = [val(get('person_hair_color')), val(get('person_hair_length'))].filter(Boolean);

  // PERSON grid slots — only answered ones render.
  const personSlots: { k: string; a?: StoredAnswer; text?: string; hot?: boolean; wide?: boolean }[] = [
    { k: 'Who', a: get('person_role') },
    { k: 'Gender', a: get('person_gender') },
    { k: 'Height', a: get('person_height') },
    { k: 'Race', a: get('person_race') },
    { k: 'Shirt', a: get('person_shirt') },
    { k: 'Hair', text: hairParts.join(' · ') },
    { k: 'Tattoo', a: get('person_tattoo'), hot: get('person_tattoo')?.value === 'Yes' },
    { k: 'Glasses', a: get('person_glasses') },
    { k: 'Build', a: get('person_build') },
    { k: 'Usually comes', a: get('person_usual_time') },
    { k: 'Other identifying details', a: get('person_details'), wide: true },
  ];

  // FOLLOW-UP compact row.
  const fuSlots: { q: string; a?: StoredAnswer; hotOnYes?: boolean }[] = [
    { q: 'WITNESSES', a: get('witnesses') },
    { q: 'HAPPENED BEFORE', a: get('happened_before'), hotOnYes: true },
    { q: 'SPEAK TO PERSON', a: get('speak_to_person') },
    { q: 'ANONYMOUS', a: get(QID.remainAnonymous) },
    { q: 'ANYTHING ELSE', a: get('anything_else') },
  ];

  // Anything the slots above don't consume (future config questions) also
  // lands in the FOLLOW-UP row so nothing is ever silently dropped.
  const consumed = new Set([
    QID.whatHappened, QID.urgency, QID.location,
    'incident_date', 'incident_time',
    'person_role', 'person_gender', 'person_height', 'person_race', 'person_shirt',
    'person_hair_color', 'person_hair_length', 'person_tattoo', 'person_glasses',
    'person_build', 'person_usual_time', 'person_details',
    'witnesses', 'happened_before', 'speak_to_person', QID.remainAnonymous, 'anything_else',
  ]);
  const extraAnswers = answers.filter((a) => !consumed.has(a.qid));

  const contactLine = r.reporter_contact
    ? r.reporter_name
      ? `${r.reporter_name} · ${r.reporter_contact}`
      : r.reporter_contact
    : r.reporter_name
      ? `${r.reporter_name} (no contact)`
      : 'submitted anonymously';

  const submitNote = async () => {
    setSavingNote(true);
    const ok = await onAddNote(r.id, noteInput);
    if (ok) setNoteInput('');
    setSavingNote(false);
  };

  return (
    <div
      className={`bg-white border border-neutral-200 border-l-[5px] ${meta.leftBorder} rounded-xl overflow-hidden ${
        isUrgent ? 'ring-2 ring-danger/25' : ''
      }`}
    >
      {/* ---- header strip ---- */}
      <div className="flex items-center gap-2.5 flex-wrap px-4 md:px-5 py-3.5 border-b border-neutral-200 bg-[#fafaf8]">
        {r.ref_code && (
          <span className="font-mono font-bold text-[13px] bg-ink text-accent px-2.5 py-1 rounded-md tracking-[0.12em]">
            {r.ref_code}
          </span>
        )}
        <span className={`font-display text-[9px] tracking-[0.12em] px-2.5 py-1.5 rounded-md ${meta.cls}`}>
          {meta.label}
        </span>
        {isUrgent && (
          <span className="font-display text-[9px] tracking-[0.1em] text-danger border-[1.5px] border-danger/45 bg-danger/[0.07] px-2.5 py-1 rounded-md">
            ⚠ HAPPENING NOW
          </span>
        )}
        <span className="ml-auto font-mono text-[10.5px] text-neutral-500 text-right leading-relaxed">
          {formatDateTime(r.created_at)} · <b className="text-neutral-700 font-bold">{contactLine}</b>
        </span>
      </div>

      {/* ---- what happened ---- */}
      <div className="px-4 md:px-5 pt-4 pb-4 border-b border-neutral-200">
        <div className="font-mono text-[9px] tracking-[0.22em] text-neutral-400 mb-1.5">// WHAT HAPPENED</div>
        <p className="text-[16px] font-semibold text-neutral-900 leading-relaxed whitespace-pre-wrap m-0">
          {r.description}
        </p>
      </div>

      {/* ---- incident ---- */}
      {(whenParts.length > 0 || urgencyAns || locationParts.length > 0) && (
        <div className="px-4 md:px-5 pt-3.5 pb-4 border-b border-neutral-200">
          <SecHead dot="#ff3b30" title="INCIDENT" />
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-4 gap-y-3">
            {whenParts.length > 0 && <KV k="When" v={whenParts.join(' · ')} />}
            {urgencyAns && <KV k="Still happening?" v={val(urgencyAns)} hot={isUrgent} />}
            {locationParts.length > 0 && (
              <div className="col-span-full">
                <div className="font-mono text-[8.5px] tracking-[0.14em] text-neutral-400 uppercase mb-1">Where</div>
                <div className="flex flex-wrap gap-1.5">
                  {locationParts.map((p) => (
                    <span
                      key={p}
                      className="font-mono font-bold text-[10.5px] bg-[#fff2f0] text-[#c2372c] border border-danger/25 px-2 py-1 rounded-md"
                    >
                      {p.toUpperCase()}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---- person description (identikit: photo + facts) ---- */}
      <div className="px-4 md:px-5 pt-3.5 pb-4 border-b border-neutral-200">
        <SecHead dot="#4d6bfa" title="PERSON DESCRIPTION" />
        <div className="flex gap-4">
          <div className="w-[96px] min-w-[96px] md:w-[120px] md:min-w-[120px]">
            {r.photo_path && photoUrl ? (
              <a href={photoUrl} target="_blank" rel="noopener noreferrer" className="block group">
                <div className="w-full aspect-square bg-neutral-900 rounded-[10px] overflow-hidden border border-neutral-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoUrl}
                    alt="evidence"
                    className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
                  />
                </div>
                <div className="font-mono text-[8.5px] tracking-[0.1em] text-neutral-400 text-center mt-1.5">
                  TAP TO ENLARGE
                </div>
              </a>
            ) : (
              <div className="w-full aspect-square bg-neutral-900 rounded-[10px] flex items-center justify-center border border-neutral-200">
                <span className="font-mono text-[9px] text-neutral-500 text-center leading-relaxed">
                  {r.photo_path ? (
                    <>PHOTO<br />UNAVAILABLE</>
                  ) : (
                    <>NO<br />PHOTO</>
                  )}
                </span>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0 grid grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-x-4 gap-y-2.5 content-start">
            {personSlots.map((s) => {
              const v = s.text !== undefined ? s.text : val(s.a);
              if (!v) return null;
              return <KV key={s.k} k={s.k} v={v} hot={s.hot} wide={s.wide} soft={s.wide} />;
            })}
            {personSlots.every((s) => !(s.text !== undefined ? s.text : val(s.a))) && (
              <div className="font-mono text-[10px] text-neutral-400 col-span-full">
                No description provided.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ---- follow-up ---- */}
      {(fuSlots.some((s) => val(s.a)) || extraAnswers.length > 0) && (
        <div className="px-4 md:px-5 pt-3.5 pb-4 border-b border-neutral-200">
          <SecHead dot="#FFD60A" title="FOLLOW-UP" />
          <div className="flex flex-wrap gap-2">
            {fuSlots.map((s) => {
              if (!s.a) return null;
              const raw = Array.isArray(s.a.value) ? s.a.value.join(', ') : s.a.value;
              if (!raw && !s.a.other) return null;
              const isYes = raw === 'Yes';
              const isNo = raw === 'No';
              const long = !isYes && !isNo; // free text / "Let management decide" / "Not sure"
              return (
                <span
                  key={s.q}
                  className="inline-flex items-center gap-1.5 bg-[#f7f7f4] border border-neutral-200 rounded-lg px-2.5 py-1.5 max-w-full"
                >
                  <span className="font-mono text-[9px] tracking-[0.06em] text-neutral-500">{s.q}</span>
                  <span
                    className={`font-display text-[10px] tracking-[0.05em] ${
                      isYes && s.hotOnYes
                        ? 'text-danger'
                        : isYes
                          ? 'text-[#0a9c47]'
                          : isNo
                            ? 'text-neutral-400'
                            : 'text-neutral-700'
                    } ${long ? 'normal-case font-sans font-semibold text-[11px]' : ''}`}
                  >
                    {long ? raw : raw.toUpperCase()}
                  </span>
                  {s.a.other && (
                    <span className="text-[11px] font-semibold text-neutral-600 truncate">— {s.a.other}</span>
                  )}
                </span>
              );
            })}
            {extraAnswers.map((a) => (
              <span
                key={a.qid}
                className="inline-flex items-center gap-1.5 bg-[#f7f7f4] border border-neutral-200 rounded-lg px-2.5 py-1.5 max-w-full"
              >
                <span className="font-mono text-[9px] tracking-[0.06em] text-neutral-500 uppercase">{a.label}</span>
                <span className="text-[11px] font-semibold text-neutral-700 truncate">{val(a)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ---- internal case log ---- */}
      <div className="mx-4 md:mx-5 mt-3.5 bg-[#fbfbf6] border border-dashed border-[#e0ddc9] rounded-[10px] p-3">
        <div className="font-display text-[9.5px] tracking-[0.16em] text-[#8a7f4a] mb-2.5 flex items-center gap-1.5">
          🗒 INTERNAL CASE LOG{' '}
          {!isAdmin && <span className="text-neutral-400 font-mono tracking-normal">· read-only</span>}
        </div>
        {notes.length > 0 ? (
          <div className="space-y-2.5 mb-2">
            {notes.map((n) => (
              <div key={n.id} className="flex gap-2.5">
                <span className="w-5 h-5 flex-shrink-0 rounded-full bg-ink text-accent font-display text-[9px] flex items-center justify-center">
                  {(n.added_by_name ?? '?').charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <div className="font-mono text-[9px] text-neutral-400">
                    {n.added_by_name ?? 'Staff'} · {formatDateTime(n.created_at)}
                  </div>
                  <div className="text-[12.5px] text-neutral-700 leading-snug whitespace-pre-wrap">{n.note}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="font-mono text-[10px] text-neutral-400 mb-1">No notes yet.</div>
        )}

        {isAdmin && (
          <div className="flex gap-2 mt-2">
            <input
              type="text"
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !savingNote) submitNote();
              }}
              placeholder="Add an internal note (investigation, action taken, outcome)…"
              className="flex-1 bg-white border-[1.5px] border-neutral-200 rounded-lg px-3 py-2 text-[12.5px] outline-none focus:border-accent"
            />
            <button
              onClick={submitNote}
              disabled={savingNote || !noteInput.trim()}
              className="font-display text-[10px] tracking-wider bg-ink text-accent px-3 rounded-lg disabled:opacity-40"
            >
              ADD
            </button>
          </div>
        )}
      </div>

      {/* ---- actions (admin only) ---- */}
      {isAdmin ? (
        <div className="flex gap-2 flex-wrap px-4 md:px-5 py-4">
          {r.status !== 'reviewing' && r.status !== 'resolved' && (
            <button
              onClick={() => onStatus('reviewing')}
              disabled={busy}
              className="font-display text-[10px] tracking-wider px-3.5 py-2 border-2 border-[#e0a800] text-[#a67c00] rounded-md hover:bg-[#e0a800]/10 disabled:opacity-50"
            >
              MARK REVIEWING
            </button>
          )}
          {r.status !== 'resolved' && (
            <button
              onClick={() => onStatus('resolved')}
              disabled={busy}
              className="font-display text-[10px] tracking-wider px-3.5 py-2 border-2 border-success-green text-[#0a9c47] rounded-md hover:bg-success-green/10 disabled:opacity-50"
            >
              MARK RESOLVED
            </button>
          )}
          {r.status !== 'new' && (
            <button
              onClick={() => onStatus('new')}
              disabled={busy}
              className="font-display text-[10px] tracking-wider px-3.5 py-2 border-2 border-neutral-300 text-neutral-500 rounded-md hover:bg-neutral-100 disabled:opacity-50"
            >
              REOPEN
            </button>
          )}
          <button
            onClick={onDelete}
            disabled={busy}
            className="font-display text-[10px] tracking-wider px-3.5 py-2 border-2 border-danger text-danger rounded-md hover:bg-danger/10 disabled:opacity-50 ml-auto"
          >
            DELETE
          </button>
        </div>
      ) : (
        <div className="pb-4" aria-hidden="true" />
      )}
    </div>
  );
}

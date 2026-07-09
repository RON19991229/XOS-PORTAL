'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import { Lang } from '@/lib/i18n';
import {
  reportFields,
  reportCopy,
  QID,
  type ReportField,
  type StoredAnswer,
} from '@/lib/report-config';
import { safeLocal, safeSession } from '@/lib/safe-storage';
import BrandMark from '@/components/BrandMark';
import LanguageToggle from '@/components/LanguageToggle';

const BUCKET = 'incident-photos';
const MAX_DIM = 1400; // evidence photos: keep a bit more detail than mugshots
const JPEG_QUALITY = 0.82;
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const COOLDOWN_MS = 90 * 1000; // client-side: block rapid re-submits from one device

// Short, human-friendly reference like "XF-2A9F". Uses an unambiguous
// alphabet (no 0/O/1/I/L) so it's easy to read out at the front desk.
function makeRefCode(): string {
  const alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  let s = '';
  for (let i = 0; i < 4; i++) {
    s += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `XF-${s}`;
}

// Client-side image compression (same approach as the Attention List).
function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read-fail'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('not-image'));
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
          reject(new Error('no-ctx'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('encode-fail'))),
          'image/jpeg',
          JPEG_QUALITY,
        );
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

type Values = Record<string, string>;
type MultiValues = Record<string, string[]>;

export default function ReportFormPage() {
  const router = useRouter();
  const supabase = createClient();

  const [lang, setLang] = useState<Lang>('en');
  const [values, setValues] = useState<Values>({});
  const [multi, setMulti] = useState<MultiValues>({});
  const [otherText, setOtherText] = useState<Values>({});
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoName, setPhotoName] = useState('');
  const [honeypot, setHoneypot] = useState(''); // bots fill this; humans never see it

  const [error, setError] = useState('');
  const [refCode, setRefCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const l =
      (safeSession.getItem('xf-report-lang') as Lang | null) ||
      (safeLocal.getItem('xf-lang') as Lang | null);
    if (l && ['en', 'zh', 'ms'].includes(l)) setLang(l);
  }, []);

  const c = reportCopy[lang];

  const handleLang = (l: Lang) => {
    setLang(l);
    safeLocal.setItem('xf-lang', l);
    safeSession.setItem('xf-report-lang', l);
  };

  const setVal = (qid: string, v: string) => setValues((p) => ({ ...p, [qid]: v }));
  const toggleMulti = (qid: string, v: string) =>
    setMulti((p) => {
      const cur = p[qid] ?? [];
      return { ...p, [qid]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] };
    });

  const pickPhoto = () => fileRef.current?.click();
  const removePhoto = () => {
    setPhotoFile(null);
    setPhotoName('');
  };
  const onPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > MAX_UPLOAD_BYTES) {
      setError(c.photoTooLarge);
      return;
    }
    setError('');
    setPhotoFile(f);
    setPhotoName(f.name);
  };

  const byGroup = (g: ReportField['group']) => reportFields.filter((f) => f.group === g);

  // -------------------------------------------------------------------------
  // Submit
  // -------------------------------------------------------------------------
  const handleSubmit = async () => {
    setError('');

    if (honeypot.trim() !== '') return; // silently drop bots

    const desc = (values[QID.whatHappened] ?? '').trim();
    if (!desc) {
      setError(c.required);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // Device cooldown
    const last = parseInt(safeLocal.getItem('xf-report-cooldown') ?? '0', 10);
    if (last && Date.now() - last < COOLDOWN_MS) {
      setError(c.cooldown);
      return;
    }

    setSubmitting(true);
    try {
      // Build the self-describing answers array (English labels + canonical values).
      // reporter_name / reporter_contact go to columns only (not duplicated here).
      const answers: StoredAnswer[] = [];
      for (const f of reportFields) {
        if (f.qid === QID.reporterName || f.qid === QID.reporterContact) continue;
        if (f.type === 'multiselect') {
          const vals = multi[f.qid] ?? [];
          const other = (otherText[f.qid] ?? '').trim();
          if (vals.length === 0 && !other) continue;
          answers.push({
            qid: f.qid,
            label: f.label.en,
            type: f.type,
            value: vals,
            ...(other ? { other } : {}),
          });
        } else {
          const v = (values[f.qid] ?? '').trim();
          if (!v) continue;
          const other = f.allowOther && v === 'Other' ? (otherText[f.qid] ?? '').trim() : '';
          answers.push({
            qid: f.qid,
            label: f.label.en,
            type: f.type,
            value: v,
            ...(other ? { other } : {}),
          });
        }
      }

      const reporterName = (values[QID.reporterName] ?? '').trim() || null;
      const reporterContact = (values[QID.reporterContact] ?? '').trim() || null;
      const remainAnon = values[QID.remainAnonymous]; // 'Yes' | 'No' | undefined
      const isAnonymous = remainAnon === 'No' ? false : !reporterContact;
      const ref = makeRefCode();

      // Optional photo: upload first (anon INSERT into private bucket), then
      // reference it on the row. Orphan photo on failure is acceptable.
      let photoPath: string | null = null;
      if (photoFile) {
        try {
          const blob = await compressImage(photoFile);
          const id =
            typeof crypto !== 'undefined' && 'randomUUID' in crypto
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
          const path = `${id}.jpg`;
          const { error: upErr } = await supabase.storage
            .from(BUCKET)
            .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
          if (!upErr) photoPath = path;
          // If the photo fails, we still submit the report without it.
        } catch {
          /* ignore photo errors — report still goes through */
        }
      }

      const { error: insErr } = await supabase.from('incident_reports').insert({
        lang,
        description: desc,
        reporter_name: reporterName,
        reporter_contact: reporterContact,
        is_anonymous: isAnonymous,
        photo_path: photoPath,
        ref_code: ref,
        answers,
      });

      if (insErr) {
        // eslint-disable-next-line no-console
        console.error('[complaint submit] insert failed:', insErr);
        setSubmitting(false);
        setError(c.errorGeneric);
        return;
      }

      safeLocal.setItem('xf-report-cooldown', String(Date.now()));
      setRefCode(ref);
      setDone(true);
      window.scrollTo({ top: 0, behavior: 'auto' });
    } catch {
      setSubmitting(false);
      setError(c.errorGeneric);
    }
  };

  // -------------------------------------------------------------------------
  // Success screen
  // -------------------------------------------------------------------------
  if (done) {
    return (
      <main className="min-h-screen flex flex-col bg-ink">
        <header className="flex items-center justify-between px-5 py-3 border-b border-ink-line">
          <BrandMark size="sm" />
        </header>
        <section className="flex-1 px-5 py-8 max-w-md mx-auto w-full text-center">
          <div className="w-[82px] h-[82px] mx-auto mb-6 rounded-full flex items-center justify-center bg-success-green/15">
            <div className="w-[58px] h-[58px] rounded-full bg-success-green flex items-center justify-center shadow-[0_0_26px_rgba(22,199,91,0.5)]">
              <svg viewBox="0 0 24 24" width="30" height="30" fill="none" aria-hidden="true">
                <path
                  d="M5 12.5l4.5 4.5L19 7.5"
                  stroke="#0a0a0a"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>

          <h1 className="font-display text-2xl leading-tight mb-4">{c.okTitle}</h1>

          {/* reference number — big, screenshot-friendly */}
          <div className="bg-[linear-gradient(180deg,rgba(255,214,10,0.12),rgba(255,214,10,0.03))] border-2 border-accent rounded-2xl p-4 mb-4">
            <div className="font-mono text-[10px] tracking-[0.2em] text-neutral-400 mb-2">
              {c.refLabel}
            </div>
            <div className="font-display text-[34px] tracking-wider text-accent leading-none">
              {refCode}
            </div>
            <div className="flex items-center justify-center gap-1.5 text-[11.5px] text-[#e8b84a] mt-2.5">
              📸 {c.refScreenshot}
            </div>
          </div>

          <div className="text-left text-[13.5px] leading-relaxed text-neutral-300 bg-ink-soft border border-ink-line rounded-xl p-4 mb-2">
            {c.okMsg}
          </div>
          <p className="text-[12px] text-neutral-400 mb-6 leading-relaxed">{c.refFollowUp}</p>

          {/* what happens next */}
          <div className="text-left mb-6">
            <div className="font-mono text-[10px] tracking-[0.2em] text-neutral-500 mb-4">
              {c.stepsTitle}
            </div>
            {c.steps.map((s, i) => (
              <div key={i} className="flex gap-3.5 mb-4 relative">
                <div
                  className={`w-[26px] h-[26px] flex-shrink-0 rounded-full flex items-center justify-center font-display text-[11px] ${
                    i === 0
                      ? 'bg-success-green text-ink'
                      : 'bg-ink border-2 border-accent text-accent'
                  }`}
                >
                  {i === 0 ? '✓' : i + 1}
                </div>
                {i < c.steps.length - 1 && (
                  <span className="absolute left-[12px] top-[26px] w-0.5 h-[calc(100%-6px)] bg-ink-line" />
                )}
                <div>
                  <h5 className="font-body font-bold text-[13px]">{s.h}</h5>
                  <p className="text-[11.5px] text-neutral-400 leading-snug">{s.p}</p>
                </div>
              </div>
            ))}
          </div>

          <div
            className="text-[12px] leading-relaxed text-neutral-300 bg-[rgba(255,180,168,0.06)] border border-[rgba(255,180,168,0.25)] rounded-xl p-3.5 mb-8 [&_b]:text-[#ffb4a8]"
            dangerouslySetInnerHTML={{ __html: c.okFoot }}
          />

          <button
            onClick={() => router.push('/')}
            className="font-display text-sm tracking-wider px-6 py-3 border-2 border-ink-line text-neutral-300 hover:border-accent hover:text-accent transition-colors"
          >
            {c.back} →
          </button>

          <div className="h-16" aria-hidden="true" />
        </section>
      </main>
    );
  }

  // -------------------------------------------------------------------------
  // Field renderer
  // -------------------------------------------------------------------------
  const renderField = (f: ReportField) => {
    const label = f.label[lang];
    const hint = f.hint?.[lang];
    const ph = f.placeholder?.[lang];
    const isOptionalContact = f.group === 'contact';

    const labelEl = (
      <label className="field-label">
        {label}{' '}
        {f.required ? (
          <span className="text-danger">*</span>
        ) : isOptionalContact ? (
          <span className="text-neutral-600 font-mono font-normal tracking-normal normal-case">
            · {c.optional}
          </span>
        ) : null}
      </label>
    );

    if (f.type === 'textarea') {
      return (
        <div className="mb-5" key={f.qid}>
          {labelEl}
          {hint && <p className="text-[11.5px] text-neutral-500 mb-2 leading-snug">{hint}</p>}
          <textarea
            value={values[f.qid] ?? ''}
            onChange={(e) => setVal(f.qid, e.target.value)}
            className="input-field min-h-[90px] resize-y"
          />
        </div>
      );
    }

    if (f.type === 'text' || f.type === 'tel' || f.type === 'date' || f.type === 'time') {
      return (
        <div className="mb-5" key={f.qid}>
          {labelEl}
          {hint && <p className="text-[11.5px] text-neutral-500 mb-2 leading-snug">{hint}</p>}
          <input
            type={f.type === 'tel' ? 'tel' : f.type}
            inputMode={f.type === 'tel' ? 'tel' : undefined}
            value={values[f.qid] ?? ''}
            onChange={(e) => setVal(f.qid, e.target.value)}
            placeholder={ph}
            className="input-field"
          />
        </div>
      );
    }

    if (f.type === 'radio') {
      return (
        <div className="mb-5" key={f.qid}>
          {labelEl}
          {hint && <p className="text-[11.5px] text-neutral-500 mb-2 leading-snug">{hint}</p>}
          <div className="flex gap-2 flex-wrap">
            {(f.options ?? []).map((o) => {
              const sel = values[f.qid] === o.value;
              return (
                <button
                  type="button"
                  key={o.value}
                  onClick={() => setVal(f.qid, sel ? '' : o.value)}
                  className={`flex-1 min-w-[88px] py-3 px-2 border-2 text-[13px] transition-colors rounded-lg ${
                    sel
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-ink-line bg-ink-soft text-neutral-300 hover:border-neutral-600'
                  }`}
                >
                  {o.label[lang]}
                </button>
              );
            })}
          </div>
          {f.qid === QID.urgency && values[f.qid] === 'Happening now' && (
            <div className="mt-3 flex gap-2.5 items-start bg-danger/10 border-2 border-danger/50 rounded-lg p-3.5">
              <span className="text-lg leading-none mt-0.5">⚠️</span>
              <p className="text-[12.5px] leading-relaxed text-[#ffb4a8]">{c.urgentNow}</p>
            </div>
          )}
        </div>
      );
    }

    if (f.type === 'select') {
      const showOther = f.allowOther && values[f.qid] === 'Other';
      return (
        <div className="mb-5" key={f.qid}>
          {labelEl}
          {hint && <p className="text-[11.5px] text-neutral-500 mb-2 leading-snug">{hint}</p>}
          <select
            value={values[f.qid] ?? ''}
            onChange={(e) => setVal(f.qid, e.target.value)}
            className="input-field"
          >
            <option value="">—</option>
            {(f.options ?? []).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label[lang]}
              </option>
            ))}
          </select>
          {showOther && (
            <input
              type="text"
              value={otherText[f.qid] ?? ''}
              onChange={(e) => setOtherText((p) => ({ ...p, [f.qid]: e.target.value }))}
              placeholder={c.otherPlaceholder}
              className="input-field mt-2"
            />
          )}
        </div>
      );
    }

    if (f.type === 'multiselect') {
      const chosen = multi[f.qid] ?? [];
      return (
        <div className="mb-5" key={f.qid}>
          {labelEl}
          {hint && <p className="text-[11.5px] text-neutral-500 mb-2 leading-snug">{hint}</p>}
          <div className="flex flex-col gap-2">
            {(f.options ?? []).map((o) => {
              const sel = chosen.includes(o.value);
              return (
                <button
                  type="button"
                  key={o.value}
                  onClick={() => toggleMulti(f.qid, o.value)}
                  className={`flex items-center gap-3 py-3 px-3.5 border-2 text-[13.5px] text-left transition-colors rounded-lg ${
                    sel
                      ? 'border-accent bg-accent/10'
                      : 'border-ink-line bg-ink-soft hover:border-neutral-600'
                  }`}
                >
                  <span
                    className={`w-[18px] h-[18px] flex-shrink-0 border-2 rounded flex items-center justify-center ${
                      sel ? 'border-accent bg-accent text-ink' : 'border-neutral-600'
                    }`}
                  >
                    {sel && (
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="none">
                        <path
                          d="M5 12.5l4.5 4.5L19 7.5"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </span>
                  <span className={sel ? 'text-accent' : 'text-neutral-200'}>{o.label[lang]}</span>
                </button>
              );
            })}
          </div>
          {f.allowOther && (
            <input
              type="text"
              value={otherText[f.qid] ?? ''}
              onChange={(e) => setOtherText((p) => ({ ...p, [f.qid]: e.target.value }))}
              placeholder={c.otherPlaceholder}
              className="input-field mt-2"
            />
          )}
        </div>
      );
    }

    return null;
  };

  const hasPhoto = !!photoFile;

  // -------------------------------------------------------------------------
  // Form
  // -------------------------------------------------------------------------
  return (
    <main className="min-h-screen flex flex-col bg-ink">
      <header className="flex items-center justify-between px-5 py-3 border-b border-ink-line">
        <BrandMark size="sm" />
        <LanguageToggle current={lang} onChange={handleLang} />
      </header>

      {/* HERO — warm, supportive */}
      <div className="px-5 pt-7 pb-5 text-center border-b border-ink-line bg-[radial-gradient(120%_80%_at_50%_0%,rgba(255,180,168,0.10),rgba(255,214,10,0.04)_45%,transparent_75%)]">
        <svg width="52" height="52" viewBox="0 0 48 48" fill="none" className="mx-auto mb-3.5" aria-hidden="true">
          <path
            d="M24 4l16 6v11c0 10-6.8 18.3-16 21-9.2-2.7-16-11-16-21V10l16-6z"
            fill="rgba(255,214,10,.10)"
            stroke="#FFD60A"
            strokeWidth="2"
          />
          <path
            d="M24 20.5c-1.6-3-6.5-2.6-6.5 1.4 0 3 3.4 5.3 6.5 7.6 3.1-2.3 6.5-4.6 6.5-7.6 0-4-4.9-4.4-6.5-1.4z"
            fill="#ffb4a8"
          />
        </svg>
        <p className="font-body font-semibold text-[19px] leading-snug text-[#f3e9e7] max-w-[320px] mx-auto">
          {c.heroQ}
        </p>
        <p className="font-display text-[22px] leading-tight text-accent mt-1.5">{c.heroHelp}</p>
        <p className="text-[12.5px] leading-relaxed text-neutral-400 mt-3.5 max-w-[300px] mx-auto">
          {c.heroReassure}
        </p>
        <div className="flex items-center justify-center gap-2 mt-4 font-mono text-[10px] tracking-wider text-success-green">
          <span className="w-1.5 h-1.5 rounded-full bg-success-green shadow-[0_0_8px_#16c75b]" />
          {c.trust}
        </div>
      </div>

      <section className="flex-1 px-5 py-6 max-w-md mx-auto w-full">
        {/* honeypot — visually hidden, off-screen; real users never fill it */}
        <input
          type="text"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="absolute -left-[9999px] w-px h-px opacity-0"
        />

        {error && (
          <div className="bg-danger text-bone px-4 py-3 font-display text-sm tracking-wider mb-5 rounded-lg animate-shake">
            {error}
          </div>
        )}

        {/* GROUP: incident */}
        <div className="mb-6">
          <div className="font-mono text-[10px] tracking-[0.22em] text-accent mb-2">{c.firstKick}</div>
          <div className="h-[3px] w-11 bg-accent rounded" />
        </div>
        {byGroup('incident').map(renderField)}

        {/* GROUP: person (+ photo) */}
        <div className="bg-[linear-gradient(180deg,rgba(255,214,10,0.04),transparent)] border-2 border-ink-line rounded-xl p-4 mb-6">
          <div className="font-body font-bold text-[13px] text-accent mb-4 flex items-center gap-2">
            <span>👤</span>
            {c.personKick}
          </div>
          {byGroup('person').map(renderField)}

          {/* photo uploader lives inside the person description */}
          <input ref={fileRef} type="file" accept="image/*" onChange={onPhoto} className="hidden" />
          <div className="mb-0">
            <label className="field-label">
              {c.addPhoto}{' '}
              <span className="text-neutral-600 font-mono font-normal tracking-normal normal-case">
                · {c.optional}
              </span>
            </label>
            {hasPhoto ? (
              <div className="border-[1.5px] border-success-green bg-success-green/5 rounded-xl p-3 flex items-center gap-3">
                <span className="font-display text-xl leading-none text-success-green">✓</span>
                <span className="flex-1 min-w-0 font-body text-[12px] text-success-green truncate">
                  {c.photoChosen} · {photoName}
                </span>
                <button
                  type="button"
                  onClick={removePhoto}
                  className="flex-shrink-0 font-mono text-[10px] tracking-wider px-2.5 py-1.5 border border-danger/50 text-danger rounded-md hover:bg-danger/10 transition-colors"
                >
                  ✕ {c.removePhoto}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={pickPhoto}
                className="w-full border-[1.5px] border-dashed border-ink-line bg-ink-soft text-neutral-400 hover:border-accent hover:text-accent rounded-xl py-6 flex flex-col items-center gap-1.5 transition-colors"
              >
                <span className="font-display text-2xl leading-none">+</span>
                <span className="font-body text-[11.5px] font-medium">{c.photoCap}</span>
              </button>
            )}
          </div>
        </div>

        {/* GROUP: followup */}
        {byGroup('followup').map(renderField)}

        {/* GROUP: contact */}
        <div className="mt-7 mb-5">
          <div className="font-mono text-[10px] tracking-[0.22em] text-accent mb-2">
            {c.contactKick}
          </div>
          <div className="h-[3px] w-11 bg-accent rounded" />
        </div>
        {byGroup('contact').map(renderField)}

        {/* NOTICE */}
        <div className="bg-success-green/[0.06] border-[1.5px] border-success-green/35 rounded-xl p-4 my-6">
          <h4 className="font-body font-bold text-[12px] text-success-green mb-2.5 flex items-center gap-1.5">
            🛡 {c.noticeH}
          </h4>
          <ul className="space-y-1.5">
            {c.notice.map((n, i) => (
              <li key={i} className="text-[11.5px] text-neutral-400 leading-snug pl-4 relative">
                <span className="absolute left-0 text-success-green text-[10px]">✓</span>
                {n}
              </li>
            ))}
          </ul>
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="btn-primary rounded-xl flex items-center justify-center gap-2"
        >
          {submitting ? (
            <span className="flex gap-1.5">
              <span className="loading-dot inline-block w-2 h-2 bg-ink rounded-full" />
              <span className="loading-dot inline-block w-2 h-2 bg-ink rounded-full" />
              <span className="loading-dot inline-block w-2 h-2 bg-ink rounded-full" />
            </span>
          ) : (
            <>{c.submit} →</>
          )}
        </button>
        <p className="text-center text-[11px] text-neutral-500 mt-3 leading-relaxed">{c.submitSub}</p>
        <p className="text-center text-[10px] text-neutral-600 mt-4 leading-relaxed px-2">{c.pdpa}</p>

        <div className="h-16" aria-hidden="true" />
      </section>
    </main>
  );
}

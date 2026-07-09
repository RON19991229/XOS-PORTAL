'use client';

// ===========================================================================
// /report/form — public complaint form — WARM WHITE theme (v2.12)
// Submit logic, honeypot, cooldown, photo compression, ref-code generation
// and the self-describing answers payload are UNCHANGED from v2.11.1.
// This redesign touches presentation only: white card sections, progress
// bar, scroll reveals, chip/checkbox micro-animations, and one-tap
// WhatsApp (urgent callout, form footer, success screen follow-up).
// ===========================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import { Lang } from '@/lib/i18n';
import {
  reportFields,
  reportCopy,
  QID,
  WHATSAPP_URL,
  type ReportField,
  type StoredAnswer,
} from '@/lib/report-config';
import { safeLocal, safeSession } from '@/lib/safe-storage';
import LanguageToggle from '@/components/LanguageToggle';
import { ReportBrand, ShieldHeart, WaButton, WaCard, Reveal } from '@/components/ReportUI';

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

// Order of the four numbered section cards (matches ReportField['group']).
const GROUP_ORDER: ReportField['group'][] = ['incident', 'person', 'followup', 'contact'];

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

  // Progress bar: light up a segment once its section has any answer.
  const qidGroup = useMemo(() => {
    const m: Record<string, ReportField['group']> = {};
    reportFields.forEach((f) => {
      m[f.qid] = f.group;
    });
    return m;
  }, []);
  const groupTouched = useMemo(() => {
    const t = new Set<ReportField['group']>();
    Object.entries(values).forEach(([qid, v]) => {
      if (v && v.trim() && qidGroup[qid]) t.add(qidGroup[qid]);
    });
    Object.entries(multi).forEach(([qid, arr]) => {
      if (arr.length > 0 && qidGroup[qid]) t.add(qidGroup[qid]);
    });
    if (photoFile) t.add('person');
    return t;
  }, [values, multi, photoFile, qidGroup]);

  // -------------------------------------------------------------------------
  // Submit (unchanged from v2.11.1)
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
      <main className="report-light min-h-screen flex flex-col">
        <header className="rl-hdr">
          <ReportBrand />
        </header>
        <section className="flex-1 px-6 pt-8 pb-12 max-w-md mx-auto w-full text-center">
          <div className="rl-okmark">
            <div className="rl-okmark-inner">
              <svg viewBox="0 0 24 24" width="30" height="30" fill="none" aria-hidden="true">
                <path
                  d="M5 12.5l4.5 4.5L19 7.5"
                  stroke="#fff"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>

          <h1 className="font-display text-[21px] leading-[1.3] mb-4 mt-0">{c.okTitle}</h1>

          {/* reference number — big, screenshot-friendly */}
          <div className="rl-refcard mb-3.5 mt-4">
            <div className="font-mono text-[9.5px] tracking-[0.22em] mb-2" style={{ color: '#9A7B00' }}>
              {c.refLabel}
            </div>
            <div className="font-display text-[38px] tracking-[0.06em] leading-none">{refCode}</div>
            <div className="text-[11px] font-semibold mt-2.5" style={{ color: '#9A7B00' }}>
              📸 {c.refScreenshot}
            </div>
          </div>

          <div
            className="text-left text-[12.5px] leading-[1.7] rounded-2xl p-4 mb-2"
            style={{
              background: 'var(--rl-card)',
              border: '1px solid var(--rl-line)',
              boxShadow: 'var(--rl-shadow)',
              color: '#57504A',
            }}
          >
            {c.okMsg}
          </div>
          <p className="text-[12px] mb-6 leading-relaxed" style={{ color: 'var(--rl-muted)' }}>
            {c.refFollowUp}
          </p>

          {/* what happens next */}
          <div className="text-left mb-5 px-0.5">
            <div className="font-mono text-[9.5px] tracking-[0.2em] mb-3.5" style={{ color: 'var(--rl-faint)' }}>
              {c.stepsTitle}
            </div>
            {c.steps.map((s, i) => (
              <div key={i} className={`rl-step flex gap-3.5 relative pb-4 ${i === 0 ? 'done' : ''}`}>
                {i < c.steps.length - 1 && <span className="rl-step-ln" />}
                <span className="rl-step-bub">{i === 0 ? '✓' : i + 1}</span>
                <div>
                  <h5 className="font-bold text-[13px] m-0 mb-0.5 mt-0.5">{s.h}</h5>
                  <p className="text-[11.5px] leading-snug m-0" style={{ color: 'var(--rl-muted)' }}>
                    {s.p}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* WhatsApp follow-up with the reference number prefilled */}
          <div
            className="text-left rounded-2xl p-4 mb-4"
            style={{
              background: 'linear-gradient(135deg,#F0FBF4,#E7F8EE)',
              border: '1.5px solid rgba(37,211,102,.35)',
            }}
          >
            <h4 className="m-0 mb-1 text-[13px] font-bold">{c.waFollowTitle}</h4>
            <p className="m-0 mb-3 text-[11.5px] leading-[1.55]" style={{ color: 'var(--rl-muted)' }}>
              {c.waFollowSub}
            </p>
            <WaButton
              href={WHATSAPP_URL}
              prefill={c.waFollowPrefill.replace('{ref}', refCode)}
              size="full"
            >
              {c.waFollowBtn} · {refCode}
            </WaButton>
          </div>

          <div
            className="text-[12px] leading-relaxed rounded-xl p-3.5 mb-7 text-left [&_b]:font-bold"
            style={{
              background: 'rgba(255,138,115,0.08)',
              border: '1px solid rgba(255,138,115,0.35)',
              color: '#8C5040',
            }}
            dangerouslySetInnerHTML={{ __html: c.okFoot }}
          />

          <button onClick={() => router.push('/')} className="rl-backbtn">
            ← {c.back}
          </button>

          <div className="h-16" aria-hidden="true" />
        </section>
      </main>
    );
  }

  // -------------------------------------------------------------------------
  // Field renderer (same config-driven types as v2.11.1, warm-white styling)
  // -------------------------------------------------------------------------
  const renderField = (f: ReportField) => {
    const label = f.label[lang];
    const hint = f.hint?.[lang];
    const ph = f.placeholder?.[lang];
    const isOptionalContact = f.group === 'contact';

    const labelEl = (
      <label className="rl-label">
        {label}{' '}
        {f.required ? (
          <span style={{ color: 'var(--rl-danger)' }}>*</span>
        ) : isOptionalContact ? (
          <span className="rl-label-opt">· {c.optional}</span>
        ) : null}
      </label>
    );

    if (f.type === 'textarea') {
      return (
        <div className="mb-[18px]" key={f.qid}>
          {labelEl}
          {hint && <p className="rl-hint">{hint}</p>}
          <textarea
            value={values[f.qid] ?? ''}
            onChange={(e) => setVal(f.qid, e.target.value)}
            className="rl-input"
          />
        </div>
      );
    }

    if (f.type === 'text' || f.type === 'tel' || f.type === 'date' || f.type === 'time') {
      return (
        <div className="mb-[18px]" key={f.qid}>
          {labelEl}
          {hint && <p className="rl-hint">{hint}</p>}
          <input
            type={f.type === 'tel' ? 'tel' : f.type}
            inputMode={f.type === 'tel' ? 'tel' : undefined}
            value={values[f.qid] ?? ''}
            onChange={(e) => setVal(f.qid, e.target.value)}
            placeholder={ph}
            className="rl-input"
          />
        </div>
      );
    }

    if (f.type === 'radio') {
      return (
        <div className="mb-[18px]" key={f.qid}>
          {labelEl}
          {hint && <p className="rl-hint">{hint}</p>}
          <div className="rl-chips">
            {(f.options ?? []).map((o) => {
              const sel = values[f.qid] === o.value;
              return (
                <button
                  type="button"
                  key={o.value}
                  onClick={() => setVal(f.qid, sel ? '' : o.value)}
                  className={`rl-chip ${sel ? 'on' : ''}`}
                >
                  {o.label[lang]}
                </button>
              );
            })}
          </div>
          {f.qid === QID.urgency && (
            <div className={`rl-urgent ${values[f.qid] === 'Happening now' ? 'show' : ''}`}>
              <div className="rl-urgent-inner">
                <p>⚠️ {c.urgentNow}</p>
                <div className="mt-3">
                  <WaButton href={WHATSAPP_URL} prefill={c.waUrgentPrefill} size="full">
                    {c.waUrgentBtn}
                  </WaButton>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    if (f.type === 'select') {
      const showOther = f.allowOther && values[f.qid] === 'Other';
      return (
        <div className="mb-[18px]" key={f.qid}>
          {labelEl}
          {hint && <p className="rl-hint">{hint}</p>}
          <select
            value={values[f.qid] ?? ''}
            onChange={(e) => setVal(f.qid, e.target.value)}
            className="rl-input"
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
              className="rl-input mt-2"
            />
          )}
        </div>
      );
    }

    if (f.type === 'multiselect') {
      const chosen = multi[f.qid] ?? [];
      return (
        <div className="mb-[18px]" key={f.qid}>
          {labelEl}
          {hint && <p className="rl-hint">{hint}</p>}
          <div className="rl-checks">
            {(f.options ?? []).map((o) => {
              const sel = chosen.includes(o.value);
              return (
                <button
                  type="button"
                  key={o.value}
                  onClick={() => toggleMulti(f.qid, o.value)}
                  className={`rl-checkrow ${sel ? 'on' : ''}`}
                >
                  <span className="rl-checkbox">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" aria-hidden="true">
                      <path
                        d="M5 12.5l4.5 4.5L19 7.5"
                        stroke="#FFD60A"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <span>{o.label[lang]}</span>
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
              className="rl-input mt-2"
            />
          )}
        </div>
      );
    }

    return null;
  };

  const hasPhoto = !!photoFile;

  // Section card metadata: [title, small tag]
  const secMeta: Record<ReportField['group'], { t: string; opt: string | null }> = {
    incident: { t: c.sec1, opt: null },
    person: { t: c.sec2, opt: c.secAllOptional },
    followup: { t: c.sec3, opt: c.secAllOptional },
    contact: { t: c.sec4, opt: c.secFullyOptional },
  };

  // -------------------------------------------------------------------------
  // Form
  // -------------------------------------------------------------------------
  return (
    <main className="report-light min-h-screen flex flex-col">
      <header className="rl-hdr">
        <ReportBrand />
        <LanguageToggle current={lang} onChange={handleLang} variant="light" />
      </header>

      {/* HERO — warm, supportive */}
      <div className="rl-hero" style={{ padding: '26px 24px 20px' }}>
        <div className="rl-rise rl-d1 inline-block">
          <ShieldHeart size={56} />
        </div>
        <h1 className="rl-rise rl-d2 font-bold text-[17px] leading-snug m-0 max-w-[320px] mx-auto">
          {c.heroQ}
        </h1>
        <div className="rl-rise rl-d3 mt-1.5">
          <span className="rl-shout text-[21px] leading-tight">
            {c.heroHelp}
            <span className="rl-hl" style={{ animationDelay: '0.35s' }} />
          </span>
        </div>
        <p
          className="rl-rise rl-d4 text-[12.5px] leading-relaxed max-w-[300px] mx-auto mt-3 mb-0"
          style={{ color: 'var(--rl-muted)' }}
        >
          {c.heroReassure}
        </p>
        <div className="rl-rise rl-d5 mt-3.5">
          <span className="rl-trust">
            <span className="rl-trust-dot" />
            {c.trust}
          </span>
        </div>
      </div>

      <section className="flex-1 px-[18px] pb-12 max-w-md mx-auto w-full">
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

        {/* progress — lights up as each section gets an answer */}
        <div className="rl-stepbar">
          {GROUP_ORDER.map((g) => (
            <span key={g} className={groupTouched.has(g) ? 'fill' : ''}>
              <i />
            </span>
          ))}
        </div>

        {error && <div className="rl-error animate-shake mb-4">{error}</div>}

        {GROUP_ORDER.map((g, gi) => (
          <Reveal key={g}>
            <section className="rl-sec">
              <div className="rl-kick">
                <span className="rl-kick-n">{gi + 1}</span>
                <h3 className="rl-kick-t m-0">{secMeta[g].t}</h3>
                {secMeta[g].opt && <span className="rl-kick-opt">{secMeta[g].opt}</span>}
              </div>

              {byGroup(g).map(renderField)}

              {/* photo uploader lives at the end of the person section */}
              {g === 'person' && (
                <>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    onChange={onPhoto}
                    className="hidden"
                  />
                  <div>
                    <label className="rl-label">
                      {c.addPhoto} <span className="rl-label-opt">· {c.optional}</span>
                    </label>
                    {hasPhoto ? (
                      <div className="rl-photo-got">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <circle cx="12" cy="12" r="10" fill="#0FA958" />
                          <path
                            d="M7.5 12.5l3 3 6-6.5"
                            stroke="#fff"
                            strokeWidth="2.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        <span
                          className="flex-1 min-w-0 text-[12px] font-semibold truncate"
                          style={{ color: 'var(--rl-green)' }}
                        >
                          {c.photoChosen} · {photoName}
                        </span>
                        <button type="button" onClick={removePhoto} className="rl-photo-rm">
                          ✕ {c.removePhoto}
                        </button>
                      </div>
                    ) : (
                      <button type="button" onClick={pickPhoto} className="rl-photo-drop">
                        <span className="font-display text-[22px] leading-none">+</span>
                        <span className="text-[11.5px] font-semibold">{c.photoCap}</span>
                      </button>
                    )}
                  </div>
                </>
              )}
            </section>
          </Reveal>
        ))}

        {/* NOTICE */}
        <Reveal>
          <div className="rl-notice mb-[18px] mt-1">
            <h4
              className="m-0 mb-2.5 text-[12.5px] font-bold flex items-center gap-1.5"
              style={{ color: 'var(--rl-green)' }}
            >
              🛡 {c.noticeH}
            </h4>
            <ul className="m-0 p-0 list-none space-y-1.5">
              {c.notice.map((n, i) => (
                <li key={i} className="rl-notice-li">
                  {n}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>

        <Reveal>
          <button type="button" onClick={handleSubmit} disabled={submitting} className="rl-submit">
            {submitting ? (
              <span className="flex gap-1.5">
                <span className="loading-dot inline-block w-2 h-2 bg-accent rounded-full" />
                <span className="loading-dot inline-block w-2 h-2 bg-accent rounded-full" />
                <span className="loading-dot inline-block w-2 h-2 bg-accent rounded-full" />
              </span>
            ) : (
              <>{c.submit} →</>
            )}
          </button>
          <p className="text-center text-[11px] mt-2.5 leading-relaxed" style={{ color: 'var(--rl-muted)' }}>
            {c.submitSub}
          </p>
        </Reveal>

        {/* WhatsApp — rather talk it through? */}
        <Reveal className="mt-4">
          <WaCard title={c.waRatherTitle} sub={c.waRatherSub} cta={c.waChat} href={WHATSAPP_URL} />
        </Reveal>

        <p
          className="text-center text-[9.5px] mt-4 leading-[1.7] px-2"
          style={{ color: 'var(--rl-faint)' }}
        >
          {c.pdpa}
        </p>

        <div className="h-14" aria-hidden="true" />
      </section>
    </main>
  );
}

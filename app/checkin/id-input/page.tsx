'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import { Lang, t } from '@/lib/i18n';
import { validateMyIC, validatePassport, digitsOnly } from '@/lib/utils';
import { safeSession, safeLocal } from '@/lib/safe-storage';
import { runCheckinLookup } from '@/lib/checkin-lookup';
import CheckinHeader from '@/components/CheckinHeader';
import { Atmo, StepRail } from '@/components/CheckinFX';
import ScrollHint from '@/components/ScrollHint';

export default function IdInputPage() {
  const router = useRouter();
  const supabase = createClient();
  const [lang, setLang] = useState<Lang>('en');
  const [nationality, setNationality] = useState<'malaysian' | 'foreigner'>('malaysian');
  const [id, setId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const savedLang = safeSession.getItem('xf-lang') as Lang | null;
    if (savedLang) setLang(savedLang);

    const nat = safeSession.getItem('xf-nationality') as 'malaysian' | 'foreigner' | null;
    if (!nat) {
      router.replace('/checkin');
      return;
    }
    setNationality(nat);
  }, [router]);

  const handleIdChange = (raw: string) => {
    setError('');
    if (nationality === 'malaysian') {
      const cleaned = digitsOnly(raw).slice(0, 12);
      setId(cleaned);
    } else {
      const cleaned = raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 20);
      setId(cleaned);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    let validationError: string | null = null;
    if (nationality === 'malaysian') {
      // For Malaysians: validateMyIC checks length, valid DOB, AND valid BP
      // code (place of birth, the 7th-8th digits). If ANY check fails, we
      // show a generic message — never the specific reason — so users who
      // type random digits don't learn which constraint to bypass next.
      // (Admins still get specific reasons in the CSV import flow.)
      if (validateMyIC(id) !== null) {
        validationError = t(lang, 'invalidIc');
      }
    } else {
      validationError = validatePassport(id);
    }
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);

    // v2.21.0: cooldown → lookup → age → ban routing lives in
    // lib/checkin-lookup.ts (shared with the remembered-phone path on /checkin).
    const result = await runCheckinLookup(supabase, id, nationality, lang);
    if (!result.ok) {
      setLoading(false);
      setError(result.error);
      return;
    }
    router.push(result.next);
  };

  const placeholder = nationality === 'malaysian'
    ? t(lang, 'icPlaceholder')
    : t(lang, 'passportPlaceholder');

  const title = nationality === 'malaysian'
    ? t(lang, 'enterIc')
    : t(lang, 'enterPassport');

  const flag = nationality === 'malaysian' ? '🇲🇾 MY' : '🌍 INTL';

  return (
    <main className="min-h-screen flex flex-col bg-ink relative">
      <Atmo />

      <CheckinHeader
        lang={lang}
        onLangChange={(l) => { setLang(l); safeLocal.setItem('xf-lang', l); }}
        className="xd-rise xd-d1"
      />

      <StepRail step={1} fillNext className="xd-rise xd-d2" />

      <section className="flex-1 flex flex-col justify-center px-5 py-10 max-w-md mx-auto w-full relative z-[2]">
        <div className="mb-8">
          <p className="font-mono text-[10px] tracking-[0.3em] text-accent mb-3 xd-rise xd-d2">
            // {flag}
          </p>
          <h1 className="font-display text-5xl md:text-6xl leading-[0.85] xd-rise xd-d3">
            {title}
          </h1>
          <div className="xd-ubar" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="xd-rise xd-d4">
            <input
              type="text"
              inputMode={nationality === 'malaysian' ? 'numeric' : 'text'}
              autoComplete="off"
              autoCapitalize="characters"
              autoFocus
              value={id}
              onChange={(e) => handleIdChange(e.target.value)}
              placeholder={placeholder}
              className="input-field-lg"
              maxLength={nationality === 'malaysian' ? 12 : 20}
            />
            {nationality === 'malaysian' && (
              <>
                {/* 12-digit progress segments — one tick lights per digit */}
                <div className="xd-segs" aria-hidden="true">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <div key={i} className={`xd-seg ${i < id.length ? 'f' : ''}`} />
                  ))}
                </div>
                <div className="flex justify-between text-xs font-mono text-neutral-500 mt-2">
                  <span className="text-[10px] tracking-[0.18em]">12 DIGITS</span>
                  <span>{id.length}/12</span>
                </div>
              </>
            )}
          </div>

          {error && (
            <div className="bg-danger text-bone px-4 py-3 font-display text-sm tracking-wider animate-shake">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !id.trim()}
            className="btn-primary xd-rise xd-d5"
          >
            {loading ? (
              <span className="flex gap-1.5 justify-center">
                <span className="loading-dot inline-block w-2 h-2 bg-ink rounded-full" />
                <span className="loading-dot inline-block w-2 h-2 bg-ink rounded-full" />
                <span className="loading-dot inline-block w-2 h-2 bg-ink rounded-full" />
              </span>
            ) : (
              <>{t(lang, 'continue')} →</>
            )}
          </button>

          <button
            type="button"
            onClick={() => router.push('/checkin')}
            className="btn-secondary xd-rise xd-d6"
          >
            ← {t(lang, 'changeNationality')}
          </button>
        </form>

        {/* Bottom spacer — see /checkin/page.tsx for rationale */}
        <div className="h-20" aria-hidden="true" />
      </section>

      {/* ScrollHint — auto-hides if the page already fits in the viewport */}
      <ScrollHint />
    </main>
  );
}

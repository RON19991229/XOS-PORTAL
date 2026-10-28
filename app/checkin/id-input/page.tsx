'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import { Lang, t } from '@/lib/i18n';
import { validateMyIC, checkinPassportIssue, digitsOnly, type PassportIssue } from '@/lib/utils';
import { safeSession, safeLocal } from '@/lib/safe-storage';
import { runCheckinLookup } from '@/lib/checkin-lookup';
import CheckinHeader from '@/components/CheckinHeader';
import { Atmo, StepRail } from '@/components/CheckinFX';
import ScrollHint from '@/components/ScrollHint';

const PASSPORT_ERROR = {
  short: 'passportTooShort',
  long: 'passportTooLong',
  chars: 'passportChars',
  junk: 'passportJunk',
  sgIc: 'sgIcInvalid',
} as const satisfies Record<PassportIssue, string>;

export default function IdInputPage() {
  const router = useRouter();
  const supabase = createClient();
  const [lang, setLang] = useState<Lang>('en');
  const [nationality, setNationality] = useState<'malaysian' | 'foreigner'>('malaysian');
  const [id, setId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // v2.24.5: a Singapore-IC-shaped number with a wrong check letter shows an
  // error plus "IT'S A PASSPORT" — a few foreign passports may share the shape.
  const [sgCheckFailed, setSgCheckFailed] = useState(false);

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
    setSgCheckFailed(false);
    if (nationality === 'malaysian') {
      const cleaned = digitsOnly(raw).slice(0, 12);
      setId(cleaned);
    } else {
      const cleaned = raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 20);
      setId(cleaned);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit(false);
  };

  const submit = async (treatAsPassport: boolean) => {
    setError('');
    setSgCheckFailed(false);

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
    } else if (validateMyIC(id) !== null) {
      // A valid Malaysian IC on this path is switched to Malaysian inside
      // runCheckinLookup, so only non-MyKad input gets the passport rules.
      const issue = checkinPassportIssue(id);
      if (issue && !(issue === 'sgIc' && treatAsPassport)) {
        validationError = t(lang, PASSPORT_ERROR[issue]);
        setSgCheckFailed(issue === 'sgIc');
      }
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

  return (
    <main className="min-h-screen flex flex-col bg-ink relative">
      <Atmo />

      <CheckinHeader
        lang={lang}
        onLangChange={(l) => { setLang(l); safeLocal.setItem('xf-lang', l); safeSession.setItem('xf-lang', l); }}
        className="xd-rise xd-d1"
      />

      <StepRail step={1} fillNext className="xd-rise xd-d2" />

      <section className="flex-1 flex flex-col justify-center px-5 py-10 max-w-md mx-auto w-full relative z-[2]">
        {/* v2.24.0: "// MY" kicker, underline bar and "12 DIGITS" label removed */}
        <h1 className="font-display text-[40px] leading-[0.9] xd-rise xd-d3">{title}</h1>
        {/* v2.24.4: some people typed random numbers — tell them this ID is
            what they'll check in with every time (Ron, Oct 2026). */}
        <p className="text-[14px] leading-snug text-neutral-300 mt-3 mb-6 xd-rise xd-d3">{t(lang, 'idFutureNote')}</p>

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
                <div className="text-right text-xs font-mono text-neutral-500 mt-2">{id.length}/12</div>
              </>
            )}
          </div>

          {error && (
            <div className="bg-danger text-bone px-4 py-3 font-display text-sm tracking-wider animate-shake">
              {error}
            </div>
          )}
          {sgCheckFailed && !loading && (
            <button
              type="button"
              onClick={() => submit(true)}
              className="block mx-auto py-2 text-[12.5px] text-neutral-300 underline underline-offset-4"
            >
              {t(lang, 'sgIcItsPassport')}
            </button>
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
            className="block mx-auto mt-1 py-2 text-[12.5px] text-neutral-400 hover:text-accent underline underline-offset-4 transition-colors xd-rise xd-d6"
          >
            ← {t(lang, 'back')}
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

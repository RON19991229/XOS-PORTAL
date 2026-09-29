'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import { Lang, t } from '@/lib/i18n';
import { safeSession, safeLocal } from '@/lib/safe-storage';
import { validateMyIC, validatePassport } from '@/lib/utils';
import { RememberedCustomer, getRemembered, forgetRemembered } from '@/lib/remember-me';
import { runCheckinLookup } from '@/lib/checkin-lookup';
import CheckinHeader from '@/components/CheckinHeader';
import TaglineMarquee from '@/components/TaglineMarquee';
import ScrollHint from '@/components/ScrollHint';
import { Atmo, StepRail } from '@/components/CheckinFX';

/**
 * v2.13 premium redesign:
 *   - Header now carries the report-style brand (tile + wordmark) with the
 *     language toggle on the right; the old big centered logo block is gone.
 *   - StepRail (01 ID → 02 RULES → 03 TRAIN) tells customers up front the
 *     flow is only three steps.
 *   - Restrained atmosphere gradient behind everything (no textures).
 *   - Entrance stagger (xd-rise) on each block; WELCOME gets a full-word
 *     yellow sweep.
 *   - Nationality cards: gradient surface, hover/press yellow border glow,
 *     arrow slide. Font weights unchanged from the previous design
 *     (font-display titles, font-mono subtitles).
 *   - Trilingual TaglineMarquee untouched.
 *
 * v2.21.0 — remembered phone: if the customer opted in on the approved
 * screen, this page greets them by first name and CONTINUE runs the same
 * checks as typing the IC (lib/checkin-lookup.ts), then the full rules page.
 * "NOT X?" shows the normal nationality cards for someone else on this
 * phone; "Forget me" deletes the saved IC.
 */
export default function CheckinPage() {
  const router = useRouter();
  const supabase = createClient();
  const [lang, setLang] = useState<Lang>('en');
  const [remembered, setRemembered] = useState<RememberedCustomer | null>(null);
  const [useOther, setUseOther] = useState(false);
  const [forgotNotice, setForgotNotice] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const saved = safeLocal.getItem('xf-lang') as Lang | null;
    if (saved && ['en', 'zh', 'ms'].includes(saved)) setLang(saved);

    safeSession.removeItem('xf-customer');
    safeSession.removeItem('xf-ic');
    safeSession.removeItem('xf-success-name');

    const r = getRemembered();
    if (r) {
      // Drop anything that no longer passes format validation.
      const invalid = r.nationality === 'malaysian' ? validateMyIC(r.ic) !== null : validatePassport(r.ic) !== null;
      if (invalid) forgetRemembered();
      else setRemembered(r);
    }
  }, []);

  const continueRemembered = async () => {
    if (!remembered || loading) return;
    setError('');
    setLoading(true);
    safeSession.setItem('xf-nationality', remembered.nationality);
    safeSession.setItem('xf-lang', lang);
    const result = await runCheckinLookup(supabase, remembered.ic, remembered.nationality, lang);
    if (!result.ok) {
      setLoading(false);
      setError(result.error);
      return;
    }
    router.push(result.next);
  };

  const forget = () => {
    forgetRemembered();
    setRemembered(null);
    setError('');
    setForgotNotice(true);
  };

  const handleLangChange = (l: Lang) => {
    setLang(l);
    safeLocal.setItem('xf-lang', l);
  };

  const choose = (nationality: 'malaysian' | 'foreigner') => {
    safeSession.setItem('xf-nationality', nationality);
    safeSession.setItem('xf-lang', lang);
    router.push('/checkin/id-input');
  };

  return (
    <main className="min-h-screen flex flex-col bg-ink relative">
      <Atmo />

      <CheckinHeader lang={lang} onLangChange={handleLangChange} className="xd-rise xd-d1" />

      <StepRail step={1} className="xd-rise xd-d2" />

      {remembered && !useOther ? (
        <section className="flex-1 flex flex-col px-5 py-6 max-w-md mx-auto w-full relative z-[2]">
          <div className="mt-6 mb-10">
            <p className="font-mono text-[10px] tracking-[0.3em] text-accent mb-3 xd-rise xd-d2">
              // {t(lang, 'welcomeBack')}
            </p>
            <h1 className="font-display text-5xl leading-[0.9] xd-rise xd-d3">
              {t(lang, 'welcomeBackHello')}{' '}
              <span className="text-accent">{remembered.firstName}</span>
            </h1>
            <div className="xd-ubar" />
            <p className="font-mono text-[10px] tracking-[0.18em] text-neutral-400 mt-4 xd-rise xd-d4">
              ✓ {t(lang, 'rememberedNote')}
            </p>
          </div>

          {error && (
            <div className="bg-danger text-bone px-4 py-3 mb-4 font-display text-sm tracking-wider animate-shake">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={continueRemembered}
            disabled={loading}
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
            onClick={() => { setUseOther(true); setError(''); }}
            disabled={loading}
            className="btn-secondary mt-4 xd-rise xd-d6"
          >
            {t(lang, 'notYouPrefix')} {remembered.firstName}? {t(lang, 'useAnotherId')}
          </button>

          <button
            type="button"
            onClick={forget}
            disabled={loading}
            className="mt-6 self-center text-[11px] text-neutral-400 hover:text-accent underline underline-offset-4 transition-colors xd-rise xd-d7"
          >
            {t(lang, 'forgetMe')}
          </button>

          <div className="h-20" aria-hidden="true" />
        </section>
      ) : (
      <section className="flex-1 flex flex-col px-5 py-6 max-w-md mx-auto w-full relative z-[2]">
        {forgotNotice && (
          <p className="font-mono text-[10px] tracking-[0.18em] text-success-green text-center mb-3">
            ✓ {t(lang, 'forgotten')}
          </p>
        )}

        {/* WELCOME heading with full-word yellow sweep */}
        <div className="mb-2 text-center">
          <p className="font-mono text-[10px] tracking-[0.3em] text-neutral-500 mb-2 xd-rise xd-d2">
            <span className="text-accent">//</span> {t(lang, 'walkInCheckIn')}
          </p>
          <h1
            className="font-display leading-[0.88] tracking-tighter xd-rise xd-d3"
            style={{ fontSize: '36px' }}
          >
            <span className="xd-sweep">{t(lang, 'welcome')}</span>
          </h1>
        </div>

        {/* Trilingual rotating marquee — animation untouched */}
        <div className="xd-rise xd-d4">
          <TaglineMarquee />
        </div>

        <p className="font-mono text-[10px] tracking-[0.3em] text-neutral-500 mb-4 text-center xd-rise xd-d5">
          {t(lang, 'chooseNationality')}
        </p>

        <button onClick={() => choose('malaysian')} className="xd-natcard mb-3.5 xd-rise xd-d6">
          <div className="flex items-center justify-between">
            <span className="text-[25px]">🇲🇾</span>
            <span className="xd-nat-arrow">→</span>
          </div>
          <div className="font-display text-2xl mt-2 mb-1.5">{t(lang, 'malaysian')}</div>
          <div className="font-mono text-[10px] text-neutral-500 tracking-wider">
            {t(lang, 'icSubtitle')}
          </div>
        </button>

        <button onClick={() => choose('foreigner')} className="xd-natcard xd-rise xd-d7">
          <div className="flex items-center justify-between">
            <span className="text-[25px]">🌍</span>
            <span className="xd-nat-arrow">→</span>
          </div>
          <div className="font-display text-2xl mt-2 mb-1.5">{t(lang, 'foreigner')}</div>
          <div className="font-mono text-[10px] text-neutral-500 tracking-wider">
            {t(lang, 'passportSubtitle')}
          </div>
        </button>

        {/* Bottom spacer — prevents the last button from being flush with
            the screen edge, which was causing customers to think the page
            had ended (and not realize they could scroll). */}
        <div className="h-20" aria-hidden="true" />
      </section>
      )}

      {/* ScrollHint — auto-hides if the page already fits in the viewport */}
      <ScrollHint />
    </main>
  );
}

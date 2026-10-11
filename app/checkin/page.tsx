'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import { Lang, t } from '@/lib/i18n';
import { safeSession, safeLocal } from '@/lib/safe-storage';
import { validateMyIC, validatePassport } from '@/lib/utils';
import { RememberedCustomer, getRemembered, forgetRemembered } from '@/lib/remember-me';
import { runCheckinLookup } from '@/lib/checkin-lookup';
import { TimeOfDay, detectLang, isBirthdayToday, timeOfDay } from '@/lib/checkin-content';
import CheckinHeader from '@/components/CheckinHeader';
import Confetti from '@/components/Confetti';
import { StepRail } from '@/components/CheckinFX';

/**
 * v2.23.0 warm welcome (Ron-approved mockup `mockups/landing-warm.html` +
 * `mockups/checkin-wow.html`):
 *   - Language: the customer's own pick (localStorage) wins; otherwise the
 *     phone's system language (zh → 中文, ms/id → BM, else EN).
 *   - Greeting by Kuala Lumpur time (GOOD MORNING / AFTERNOON / EVENING,
 *     "night owl" while closed 1–6 AM) — remembered phone only since v2.24.0;
 *     new visitors see WELCOME TO + the X FITNESS wordmark.
 *   - OPEN NOW pill from the fixed hours 6:00 AM – 1:00 AM daily.
 *   - Tagline in the current language only (the old trilingual marquee
 *     showed BM while EN was selected and pushed the cards below the fold).
 *   - v2.24.0 (Ron: "首页太多字"): sub-line, tagline, FIRST TIME HERE? tips,
 *     daily line and Instagram / Facebook / playlist removed; greeting smaller.
 *   - Remembered phone: time greeting + first name; on a Malaysian IC's
 *     birthday (IC digits 3–6) → 🎂 + confetti.
 *   - Never shows live head counts (business volume stays private).
 *
 * v2.21.0 remembered-phone behaviour is unchanged: CONTINUE runs the same
 * checks as typing the IC (lib/checkin-lookup.ts), then the full rules page.
 */

const GREET: Record<TimeOfDay, Parameters<typeof t>[1]> = {
  morning: 'greetMorning',
  afternoon: 'greetAfternoon',
  evening: 'greetEvening',
  closed: 'greetNight',
};

export default function CheckinPage() {
  const router = useRouter();
  const supabase = createClient();
  const [lang, setLang] = useState<Lang>('en');
  const [tod, setTod] = useState<TimeOfDay | null>(null);
  const [remembered, setRemembered] = useState<RememberedCustomer | null>(null);
  const [useOther, setUseOther] = useState(false);
  const [forgotNotice, setForgotNotice] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const saved = safeLocal.getItem('xf-lang') as Lang | null;
    setLang(saved && ['en', 'zh', 'ms'].includes(saved) ? saved : detectLang());

    setTod(timeOfDay());
    const clock = window.setInterval(() => setTod(timeOfDay()), 60_000);

    safeSession.removeItem('xf-customer');
    safeSession.removeItem('xf-ic');
    safeSession.removeItem('xf-success-name');
    safeSession.removeItem('xf-visit-number');

    const r = getRemembered();
    if (r) {
      // Drop anything that no longer passes format validation.
      const invalid = r.nationality === 'malaysian' ? validateMyIC(r.ic) !== null : validatePassport(r.ic) !== null;
      if (invalid) forgetRemembered();
      else setRemembered(r);
    }
    return () => window.clearInterval(clock);
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

  // Chinese has no glyphs in Archivo Black — use Inter 900 like the old marquee.
  const heavy = lang === 'zh' ? 'font-sans font-black' : 'font-display';
  const birthday = remembered ? isBirthdayToday(remembered.ic, remembered.nationality) : false;

  return (
    <main className="min-h-screen flex flex-col bg-ink relative overflow-hidden">
      <div className="ck-amb" aria-hidden="true">
        <div className="ck-orb ck-orb-1" />
        <div className="ck-orb ck-orb-2" />
      </div>

      <CheckinHeader lang={lang} onLangChange={handleLangChange} className="xd-rise xd-d1 !bg-ink/40 backdrop-blur-sm" />

      <StepRail step={1} className="xd-rise xd-d2" />

      {remembered && !useOther ? (
        <section className="flex-1 flex flex-col px-5 py-6 max-w-md mx-auto w-full relative z-[2]">
          {birthday && <Confetti count={70} delay={300} />}
          <div className="mt-2 mb-9">
            {tod && <OpenPill tod={tod} lang={lang} />}

            {birthday ? (
              <>
                <div className="mt-6"><span className="ck-cake" aria-hidden="true">🎂</span></div>
                <h1 className={`${heavy} text-[38px] leading-[0.95] mt-3`}>
                  <Letters text={t(lang, 'happyBirthday')} />
                </h1>
              </>
            ) : (
              <h1 className={`${heavy} text-[40px] leading-[0.95] mt-6 min-h-[38px]`}>
                {tod && <Letters text={t(lang, GREET[tod]) + (lang === 'zh' ? '，' : ',')} />}
              </h1>
            )}
            <p className="font-display text-[52px] leading-[0.92] text-accent mt-1.5 break-words">
              <Letters text={remembered.firstName} start={0.7} step={0.05} />
            </p>
            {birthday && (
              <p className="text-[15px] text-neutral-300 mt-4 xd-rise xd-d6">{t(lang, 'birthdaySub')} 🎉</p>
            )}
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
            className="btn-primary xd-rise xd-d6"
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
            className="mt-5 self-center text-[12.5px] text-neutral-400 hover:text-accent underline underline-offset-4 transition-colors xd-rise xd-d7"
          >
            {t(lang, 'notYouLink').replace('{name}', remembered.firstName)}
          </button>

          <button
            type="button"
            onClick={forget}
            disabled={loading}
            className="mt-3 self-center text-[11px] text-neutral-500 hover:text-accent underline underline-offset-4 transition-colors xd-rise xd-d7"
          >
            {t(lang, 'forgetMe')}
          </button>

          <div className="h-16" aria-hidden="true" />
        </section>
      ) : (
        <section className="flex-1 flex flex-col px-5 pt-5 pb-6 max-w-md mx-auto w-full relative z-[2]">
          {forgotNotice && (
            <p className="font-mono text-[10px] tracking-[0.18em] text-success-green text-center mb-3">
              ✓ {t(lang, 'forgotten')}
            </p>
          )}

          {/* v2.24.0 (Ron): plain "WELCOME TO" + the X FITNESS wordmark
              instead of the time-of-day greeting. */}
          <div>
            {tod && <OpenPill tod={tod} lang={lang} />}
            <h1 className="mt-7">
              <span className={`block ${heavy} text-[26px] leading-none text-neutral-300`}>
                <Letters text={t(lang, 'welcomeToXFitness')} />
              </span>
              <Image
                src="/report-wordmark.png"
                alt="X FITNESS"
                width={482}
                height={54}
                priority
                className="block w-full max-w-[340px] h-auto mt-3.5 invert xd-rise xd-d5"
              />
            </h1>
          </div>

          <p className="font-mono text-[10px] tracking-[0.3em] text-neutral-500 mt-10 mb-3 xd-rise xd-d6">
            {t(lang, 'chooseNationality')}
          </p>

          <button onClick={() => choose('malaysian')} className="xd-natcard !py-[18px] mb-3 xd-rise xd-d7">
            <div className="flex items-center gap-3.5">
              <span className="text-[30px] leading-none">🇲🇾</span>
              <div className="flex-1">
                <div className={`${heavy} text-[22px]`}>{t(lang, 'malaysian')}</div>
                <div className="font-mono text-[10px] text-neutral-500 tracking-wider mt-1">
                  {t(lang, 'icSubtitle')}
                </div>
              </div>
              <span className="xd-nat-arrow">→</span>
            </div>
          </button>

          <button onClick={() => choose('foreigner')} className="xd-natcard !py-[18px] xd-rise xd-d7">
            <div className="flex items-center gap-3.5">
              <span className="text-[30px] leading-none">🌍</span>
              <div className="flex-1">
                <div className={`${heavy} text-[22px]`}>{t(lang, 'foreigner')}</div>
                <div className="font-mono text-[10px] text-neutral-500 tracking-wider mt-1">
                  {t(lang, 'passportSubtitle')}
                </div>
              </div>
              <span className="xd-nat-arrow">→</span>
            </div>
          </button>

          <div className="h-12" aria-hidden="true" />
        </section>
      )}
    </main>
  );
}

/** Splits text into per-letter spans that rise in one after another. Words never break mid-word. */
function Letters({
  text,
  start = 0.35,
  step = 0.035,
  tail,
}: {
  text: string;
  start?: number;
  step?: number;
  tail?: React.ReactNode;
}) {
  let n = 0;
  const words = text.split(' ');
  return (
    <span aria-label={text}>
      {words.map((w, wi) => (
        <span key={wi} aria-hidden="true">
          <span className="whitespace-nowrap">
            {Array.from(w).map((c, ci) => (
              <span key={ci} className="ck-ch" style={{ animationDelay: `${(start + n++ * step).toFixed(3)}s` }}>
                {c}
              </span>
            ))}
            {wi === words.length - 1 && tail}
          </span>
          {wi < words.length - 1 && ' '}
        </span>
      ))}
    </span>
  );
}

function OpenPill({ tod, lang }: { tod: TimeOfDay; lang: Lang }) {
  const closed = tod === 'closed';
  return (
    <span className={`ck-open xd-rise xd-d2 ${closed ? 'closed' : ''}`}>
      <span className="ck-dot" aria-hidden="true" />
      {t(lang, closed ? 'closedNow' : 'openNow')}
    </span>
  );
}

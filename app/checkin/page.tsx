'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import { Lang, t } from '@/lib/i18n';
import { safeSession, safeLocal } from '@/lib/safe-storage';
import { validateMyIC, validatePassport } from '@/lib/utils';
import { RememberedCustomer, getRemembered, forgetRemembered } from '@/lib/remember-me';
import { runCheckinLookup } from '@/lib/checkin-lookup';
import {
  FIRST_TIME_TIPS,
  SOCIAL_LINKS,
  TimeOfDay,
  dailyLine,
  detectLang,
  isBirthdayToday,
  timeOfDay,
} from '@/lib/checkin-content';
import CheckinHeader from '@/components/CheckinHeader';
import Confetti from '@/components/Confetti';
import { StepRail } from '@/components/CheckinFX';

/**
 * v2.23.0 warm welcome (Ron-approved mockup `mockups/landing-warm.html` +
 * `mockups/checkin-wow.html`):
 *   - Language: the customer's own pick (localStorage) wins; otherwise the
 *     phone's system language (zh → 中文, ms/id → BM, else EN).
 *   - Greeting by Kuala Lumpur time (GOOD MORNING / AFTERNOON / EVENING,
 *     "night owl" while closed 1–6 AM) with sun/moon icon and 👋 wave.
 *   - OPEN NOW pill from the fixed hours 6:00 AM – 1:00 AM daily.
 *   - Tagline in the current language only (the old trilingual marquee
 *     showed BM while EN was selected and pushed the cards below the fold).
 *   - Below the nationality cards: FIRST TIME HERE? tips, a daily line,
 *     Instagram / Facebook / playlist.
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
const SUB: Record<TimeOfDay, Parameters<typeof t>[1]> = {
  morning: 'subMorning',
  afternoon: 'subTrain',
  evening: 'subTrain',
  closed: 'subNight',
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
            <p className="text-[15px] text-neutral-300 mt-4 xd-rise xd-d6">
              {birthday ? `${t(lang, 'birthdaySub')} 🎉` : t(lang, 'greatToSeeYou')}
            </p>
            <p className="font-mono text-[10px] tracking-[0.18em] text-neutral-400 mt-3 xd-rise xd-d6">
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
            className="btn-secondary mt-4 xd-rise xd-d7"
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

          <DailyLine lang={lang} heavy={heavy} />
          <div className="h-16" aria-hidden="true" />
        </section>
      ) : (
        <section className="flex-1 flex flex-col px-5 pt-5 pb-6 max-w-md mx-auto w-full relative z-[2]">
          {forgotNotice && (
            <p className="font-mono text-[10px] tracking-[0.18em] text-success-green text-center mb-3">
              ✓ {t(lang, 'forgotten')}
            </p>
          )}

          <div className="relative min-h-[170px]">
            {tod && <OpenPill tod={tod} lang={lang} />}
            {tod && <TodIcon tod={tod} />}
            <h1 className={`${heavy} text-[46px] leading-[0.95] mt-5 pr-2`}>
              {tod && (
                <Letters
                  text={t(lang, GREET[tod])}
                  tail={<span className="ck-wave" aria-hidden="true">👋</span>}
                />
              )}
            </h1>
            {tod && (
              <p className={`${heavy} text-2xl leading-none mt-2.5 xd-rise xd-d5`}>
                <span className="xd-sweep">{t(lang, SUB[tod])}</span>
              </p>
            )}
            <p className="text-[14.5px] leading-relaxed text-neutral-400 mt-4 xd-rise xd-d6">
              {t(lang, 'landingTagline')}
            </p>
          </div>

          <p className="font-mono text-[10px] tracking-[0.3em] text-neutral-500 mt-7 mb-3 xd-rise xd-d6">
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

          <details className="ck-ft mt-5 xd-rise xd-d7">
            <summary className="font-display text-xs tracking-[0.06em] text-neutral-300">
              <span>👋 {t(lang, 'firstTimeTitle')}</span>
              <span className="chev" aria-hidden="true">▾</span>
            </summary>
            <ul className="px-3.5 pb-3.5 grid gap-2.5">
              {FIRST_TIME_TIPS[lang].map(([icon, text]) => (
                <li key={text} className="flex gap-2.5 text-[13.5px] leading-snug text-neutral-300">
                  <span className="text-lg leading-none" aria-hidden="true">{icon}</span>
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </details>

          <DailyLine lang={lang} heavy={heavy} />
          <Socials lang={lang} />

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

function TodIcon({ tod }: { tod: TimeOfDay }) {
  const night = tod === 'evening' || tod === 'closed';
  return (
    <svg className="absolute right-0 top-0 w-[54px] h-[54px] xd-rise xd-d3" viewBox="0 0 54 54" aria-hidden="true">
      {night ? (
        <>
          <g className="ck-moon">
            <path d="M34 10a17 17 0 1 0 12 26A14 14 0 0 1 34 10z" fill="#FFD60A" />
          </g>
          <path className="ck-star" d="M12 10l1.2 3 3 1.2-3 1.2L12 18.4l-1.2-3-3-1.2 3-1.2z" fill="#fff" />
          <path className="ck-star" d="M46 6l.9 2.1 2.1.9-2.1.9L46 12l-.9-2.1-2.1-.9 2.1-.9z" fill="#FFD60A" />
          <path className="ck-star" d="M8 38l.8 1.8 1.8.8-1.8.8L8 43.2l-.8-1.8-1.8-.8 1.8-.8z" fill="#fff" />
        </>
      ) : (
        <>
          <g className="ck-sun-rays" stroke="#FFD60A" strokeWidth="3" strokeLinecap="round">
            {Array.from({ length: 8 }).map((_, i) => {
              const a = (i * Math.PI) / 4;
              return (
                <line
                  key={i}
                  x1={27 + Math.cos(a) * 18}
                  y1={27 + Math.sin(a) * 18}
                  x2={27 + Math.cos(a) * 24}
                  y2={27 + Math.sin(a) * 24}
                />
              );
            })}
          </g>
          <circle className="ck-sun-core" cx="27" cy="27" r="12" fill={tod === 'morning' ? '#FFB020' : '#FFD60A'} />
        </>
      )}
    </svg>
  );
}

function DailyLine({ lang, heavy }: { lang: Lang; heavy: string }) {
  const [line, setLine] = useState('');
  // Computed after mount so the server-rendered HTML never disagrees with the phone's date.
  useEffect(() => setLine(dailyLine(lang)), [lang]);
  if (!line) return null;
  return (
    <div className="mt-7 border-l-[3px] border-accent pl-3.5 py-1 xd-rise xd-d7">
      <p className="font-mono text-[9px] tracking-[0.25em] text-neutral-500 mb-1.5">{t(lang, 'dailyLineLabel')}</p>
      <p className={`${heavy} text-base leading-snug text-neutral-200`}>“{line}”</p>
    </div>
  );
}

function Socials({ lang }: { lang: Lang }) {
  const cls =
    'ck-press ck-press-dark flex-1 flex items-center justify-center gap-1.5 border border-[#2e2e2e] bg-[#121212] text-neutral-300 py-3 px-1.5 font-mono text-[10px] tracking-[0.1em]';
  return (
    <div className="flex gap-2 mt-6 xd-rise xd-d7">
      <a className={cls} href={SOCIAL_LINKS.instagram} target="_blank" rel="noopener noreferrer">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
        </svg>
        INSTAGRAM
      </a>
      <a className={cls} href={SOCIAL_LINKS.facebook} target="_blank" rel="noopener noreferrer">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M14 8h3V4h-3c-2.8 0-4 1.7-4 4.3V10H7v4h3v8h4v-8h3l1-4h-4V8.6c0-.4.2-.6.6-.6z" />
        </svg>
        FACEBOOK
      </a>
      <a className={cls} href={SOCIAL_LINKS.playlist} target="_blank" rel="noopener noreferrer">
        <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="10" fill="currentColor" />
          <path
            d="M7 9.5c3.5-1 7.3-.6 10 1M7.6 12.5c3-.8 6-.4 8.3 1M8.2 15.3c2.4-.6 4.6-.3 6.4.8"
            stroke="#121212"
            strokeWidth="1.6"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
        {t(lang, 'playlist')}
      </a>
    </div>
  );
}

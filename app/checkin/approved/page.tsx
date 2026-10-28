'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lang, t } from '@/lib/i18n';
import { formatDateTime } from '@/lib/utils';
import { safeSession, safeJsonParse } from '@/lib/safe-storage';
import { Customer } from '@/lib/types';
import { isMilestone, milestoneLabel, visitLabel } from '@/lib/checkin-content';
import Confetti from '@/components/Confetti';
import {
  getRemembered,
  saveRemembered,
  hasDeclinedRemember,
  declineRemember,
} from '@/lib/remember-me';

/**
 * APPROVED — Full-screen green page (per user request 2026-05-06).
 *
 * Design notes:
 *   - Full-bleed green (#16c75b) so it's visible from across the gym.
 *   - Black ✓ box rotated -3° to keep X FITNESS visual identity.
 *   - All text in black (max contrast on green).
 *   - Auto-redirects to /checkin after 12 seconds.
 *   - v2.21.0: black "FASTER NEXT TIME?" box offers to remember this phone.
 *     Only shown when the phone doesn't remember anyone yet (so a friend
 *     using "NOT X?" can't overwrite the owner) and hasn't said "No thanks".
 *   - v2.24.0: "// STATUS: ACTIVE" removed; one big localized APPROVED word;
 *     PAY AT THE COUNTER in an outlined box; the remember box asks one
 *     question. The timestamp stays — front desk uses it to spot screenshots.
 *   - v2.24.5: the timestamp ticks every second next to a blinking dot (a
 *     screenshot is frozen, so front desk can tell). While the remember box
 *     is still asking, the auto-return waits (up to 60 s) instead of 12 s;
 *     once answered, the usual 12 s countdown starts.
 */
const RETURN_MS = 12_000;
const ASK_MAX_MS = 60_000;
export default function ApprovedPage() {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>('en');
  const [name, setName] = useState('');
  const [now, setNow] = useState('');
  const [ready, setReady] = useState(false);
  const [visitNo, setVisitNo] = useState<number | null>(null);
  const [offer, setOffer] = useState<{ ic: string; nationality: Customer['nationality']; name: string } | null>(null);
  const [offerState, setOfferState] = useState<'ask' | 'saved' | 'declined'>('ask');

  useEffect(() => {
    const savedLang = safeSession.getItem('xf-lang') as Lang | null;
    const savedName = safeSession.getItem('xf-success-name');

    if (!savedName) {
      router.replace('/checkin');
      return;
    }
    if (savedLang) setLang(savedLang);
    setName(savedName);
    setNow(formatDateTime(new Date()));
    const vn = Number(safeSession.getItem('xf-visit-number'));
    if (Number.isInteger(vn) && vn > 0) setVisitNo(vn);

    const c = safeJsonParse<Customer>(safeSession.getItem('xf-customer'));
    const nationality =
      c?.nationality ?? (safeSession.getItem('xf-nationality') as Customer['nationality'] | null);
    if (c?.ic && nationality && !getRemembered() && !hasDeclinedRemember()) {
      setOffer({ ic: c.ic, nationality, name: c.name || savedName });
    }
    setReady(true);

    const clock = setInterval(() => setNow(formatDateTime(new Date())), 1000);
    return () => clearInterval(clock);
  }, [router]);

  // Auto-return: 12 s normally; while the remember box is still asking, wait
  // for an answer (capped at 60 s), then 12 s from the answer.
  const asking = offer !== null && offerState === 'ask';
  useEffect(() => {
    if (!ready) return;
    const timeout = setTimeout(() => {
      safeSession.clear();
      router.replace('/checkin');
    }, asking ? ASK_MAX_MS : RETURN_MS);
    return () => clearTimeout(timeout);
  }, [ready, asking, router]);

  return (
    <main className="min-h-screen bg-success-green text-ink flex flex-col relative overflow-hidden">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 text-center">
        {/* v2.13: black tilted box now slams in with an SVG checkmark that
            draws itself (stroke-dasharray), plus a fading echo ring. Same
            brand language (tilted ink box), upgraded motion. */}
        <div className="xd-ckwrap mb-7">
          <div className="xd-ckring" aria-hidden="true" />
          <div className="xd-ckbox">
            <svg className="xd-ck" viewBox="0 0 80 80" aria-hidden="true">
              <path d="M16 42 L34 60 L66 22" />
            </svg>
          </div>
        </div>

        <h1
          className={`${lang === 'zh' ? 'font-sans font-black' : 'font-display'} text-[clamp(40px,13.5vw,56px)] leading-[0.9] tracking-tighter mb-6 max-w-md text-ink xd-rise xd-d4`}
        >
          {t(lang, 'approvedTitle')}
        </h1>

        <div className="bg-ink text-bone px-6 py-3 mb-8 inline-block xd-rise xd-d5">
          <p className="font-display text-xl md:text-2xl tracking-wider">
            {name.toUpperCase()}
          </p>
        </div>

        {/* v2.23.0: visit milestone stamp (1/10/25/50/100, then every 50) or a quiet visit number */}
        {visitNo !== null &&
          (isMilestone(visitNo) ? (
            <>
              <div className={`ck-stamp -mt-3 mb-6 ${lang === 'zh' ? 'font-sans font-black' : 'font-display'} text-[15px] tracking-[0.04em]`}>
                {milestoneLabel(lang, visitNo)}
              </div>
              <Confetti count={50} delay={900} />
            </>
          ) : (
            <p className="font-mono text-xs tracking-[0.2em] text-ink/70 -mt-4 mb-6 xd-rise xd-d6">{visitLabel(lang, visitNo)}</p>
          ))}

        <p
          className={`${lang === 'zh' ? 'font-sans font-black' : 'font-display'} text-base tracking-wider max-w-md text-ink border-[3px] border-ink px-5 py-3 xd-rise xd-d6`}
        >
          {t(lang, 'approvedSub')}
        </p>

        <p className="font-mono text-sm font-bold text-ink/80 mt-4 xd-rise xd-d7 tabular-nums">
          <span className="ck-live" aria-hidden="true" />
          {now}
        </p>
      </div>

      {offer && (
        <div className="px-4 pb-8 w-full max-w-md mx-auto xd-rise xd-d7">
          <div className="bg-ink text-bone p-5 flex flex-col gap-3">
            {offerState === 'ask' && (
              <>
                <p className={`${lang === 'zh' ? 'font-sans font-black' : 'font-display'} text-lg leading-tight`}>{t(lang, 'rememberAsk')}</p>
                <button
                  type="button"
                  onClick={() => {
                    saveRemembered(offer.ic, offer.nationality, offer.name);
                    setOfferState('saved');
                  }}
                  className="ck-press ck-shine w-full py-4 rounded-full bg-accent text-ink font-display text-sm tracking-wider shadow-[0_0_0_5px_rgba(255,214,10,.16),0_10px_26px_rgba(255,214,10,.28)]"
                >
                  {t(lang, 'rememberBtn')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    declineRemember();
                    setOfferState('declined');
                  }}
                  className="self-center text-xs text-neutral-400 underline underline-offset-4 px-1 py-1"
                >
                  {t(lang, 'rememberNo')}
                </button>
              </>
            )}
            {offerState === 'saved' && (
              <div className="flex items-center gap-3">
                <span className="w-9 h-9 flex-shrink-0 grid place-items-center bg-success-green text-ink font-display">✓</span>
                <div>
                  <p className="font-display text-base">{t(lang, 'rememberSaved')}</p>
                  <p className="text-xs text-neutral-400 mt-0.5">{t(lang, 'rememberSavedSub')}</p>
                </div>
              </div>
            )}
            {offerState === 'declined' && (
              <p className="text-sm text-neutral-300">{t(lang, 'rememberDeclined')}</p>
            )}
          </div>
        </div>
      )}

      {/* countdown bar — mirrors the 12s auto-return to /checkin so
          customers can see how long the screen stays up */}
      {ready && !asking && <div className="xd-countbar" aria-hidden="true" />}
    </main>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lang, t } from '@/lib/i18n';
import { formatDateTime } from '@/lib/utils';
import { safeSession, safeJsonParse } from '@/lib/safe-storage';
import { Customer } from '@/lib/types';
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
 */
export default function ApprovedPage() {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>('en');
  const [name, setName] = useState('');
  const [now, setNow] = useState('');
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

    const c = safeJsonParse<Customer>(safeSession.getItem('xf-customer'));
    const nationality =
      c?.nationality ?? (safeSession.getItem('xf-nationality') as Customer['nationality'] | null);
    if (c?.ic && nationality && !getRemembered() && !hasDeclinedRemember()) {
      setOffer({ ic: c.ic, nationality, name: c.name || savedName });
    }

    const timeout = setTimeout(() => {
      safeSession.clear();
      router.replace('/checkin');
    }, 12000);

    return () => clearTimeout(timeout);
  }, [router]);

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

        <p className="font-mono text-xs tracking-[0.3em] text-ink mb-3 xd-rise xd-d3">
          {t(lang, 'statusActive')}
        </p>

        <h1 className="font-display text-4xl md:text-5xl leading-[0.9] tracking-tighter mb-6 max-w-md text-ink xd-rise xd-d4">
          WALK-IN
          <br />
          ACCESS
          <br />
          APPROVED
        </h1>

        <div className="bg-ink text-bone px-6 py-3 mb-8 inline-block xd-rise xd-d5">
          <p className="font-display text-xl md:text-2xl tracking-wider">
            {name.toUpperCase()}
          </p>
        </div>

        <p className="font-display text-sm md:text-base tracking-wider max-w-md text-ink xd-rise xd-d6 mb-2">
          {t(lang, 'approvedSub')}
        </p>

        <p className="font-mono text-xs text-ink/60 mt-4 xd-rise xd-d7">{now}</p>
      </div>

      {offer && (
        <div className="px-4 pb-8 w-full max-w-md mx-auto xd-rise xd-d7">
          <div className="bg-ink text-bone p-5 flex flex-col gap-3">
            {offerState === 'ask' && (
              <>
                <p className="font-mono text-[10px] tracking-[0.25em] text-accent">
                  // {t(lang, 'rememberTitle')}
                </p>
                <p className="font-display text-lg leading-tight">{t(lang, 'rememberBody')}</p>
                <button
                  type="button"
                  onClick={() => {
                    saveRemembered(offer.ic, offer.nationality, offer.name);
                    setOfferState('saved');
                  }}
                  className="w-full py-4 bg-accent text-ink font-display text-sm tracking-wider"
                >
                  {t(lang, 'rememberBtn')}
                </button>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] text-neutral-400 leading-snug">{t(lang, 'rememberNote')}</span>
                  <button
                    type="button"
                    onClick={() => {
                      declineRemember();
                      setOfferState('declined');
                    }}
                    className="flex-shrink-0 text-xs text-neutral-300 underline underline-offset-4 px-1 py-2"
                  >
                    {t(lang, 'rememberNo')}
                  </button>
                </div>
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
      <div className="xd-countbar" aria-hidden="true" />
    </main>
  );
}

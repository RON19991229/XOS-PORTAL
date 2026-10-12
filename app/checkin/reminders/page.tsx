'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@/lib/supabase-client';
import { Lang, t } from '@/lib/i18n';
import { Customer } from '@/lib/types';
import { visitLabel } from '@/lib/checkin-content';
import { safeSession, safeJsonParse } from '@/lib/safe-storage';
import CheckinHeader from '@/components/CheckinHeader';
import { Atmo, StepRail, XdReveal } from '@/components/CheckinFX';
import TermsModal from '@/components/TermsModal';
import ScrollHint from '@/components/ScrollHint';

/** "RULE #1 — RE-RACK" → "RE-RACK" (all 3 langs use the same — separator;
 *  falls back to the full string if the separator is missing). */
function ruleTitle(full: string): string {
  const parts = full.split('—');
  return parts.length > 1 ? parts[parts.length - 1].trim() : full;
}

interface VisitStats {
  totalVisits: number;
  lastVisitAt: string | null;
}

export default function RemindersPage() {
  const router = useRouter();
  const supabase = createClient();
  const [lang, setLang] = useState<Lang>('en');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [stats, setStats] = useState<VisitStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const savedLang = safeSession.getItem('xf-lang') as Lang | null;
    if (savedLang) setLang(savedLang);

    const data = safeSession.getItem('xf-customer');
    const c = safeJsonParse<Customer>(data);
    if (!c) {
      router.replace('/checkin');
      return;
    }
    setCustomer(c);

    // Fetch visit stats (best-effort, non-blocking).
    // v2.18.3: exact-IC RPC (approved count + last approved visit) — anon
    // can no longer SELECT the visits table directly.
    (async () => {
      const { data, error } = await supabase
        .rpc('checkin_visit_stats', { p_ic: c.ic });
      if (error) return;
      const row = data && data.length > 0 ? data[0] : null;
      setStats({
        totalVisits: row?.total_visits ?? 0,
        lastVisitAt: row?.last_visit_at ?? null,
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const handleAcknowledge = async () => {
    if (!customer) return;
    setLoading(true);
    setErrorMsg('');

    const { error: insertError } = await supabase.from('visits').insert({
      customer_id: customer.id,
      ic: customer.ic,
      status: 'approved',
    });

    if (insertError) {
      setLoading(false);
      // Database trigger may reject due to 30-minute cooldown
      if (insertError.message?.includes('COOLDOWN')) {
        const match = insertError.message.match(/wait (\d+) minute/);
        const remaining = match ? match[1] : '30';
        setErrorMsg(
          lang === 'zh'
            ? `您已在不久前入场过。请等候约 ${remaining} 分钟后再试。`
            : lang === 'ms'
            ? `Anda baru daftar masuk tidak lama dahulu. Sila tunggu kira-kira ${remaining} minit lagi.`
            : `You checked in recently. Please wait approximately ${remaining} more minutes before trying again.`
        );
      } else {
        setErrorMsg(t(lang, 'error') + ': ' + insertError.message);
      }
      return;
    }

    safeSession.setItem('xf-success-name', customer.name);
    // v2.23.0: this visit's number (approved visits before + this one) for the
    // milestone stamp on /checkin/approved. Skipped if stats never loaded.
    if (stats) safeSession.setItem('xf-visit-number', String(stats.totalVisits + 1));
    router.push('/checkin/approved');
  };

  if (!customer) return null;

  return (
    <main className="min-h-screen flex flex-col bg-ink relative">
      <Atmo />

      <CheckinHeader className="xd-rise xd-d1" />

      <StepRail step={2} fillNext className="xd-rise xd-d1" />

      <section className="flex-1 px-5 py-6 max-w-md mx-auto w-full relative z-[2]">
        {/* v2.24.0: one hello line + this visit's number, one title. The
            "// WELCOME BACK", last-visit timestamp, "// GYM RULES REMINDER",
            IMPORTANT RULES tag and "// DO & DON'T" heading are gone (the
            DO / DON'T images carry their own headers). All 4 images stay —
            Ron wants the full rules on every visit. */}
        <p className="font-display text-xl leading-none xd-rise xd-d2">
          {t(lang, 'welcomeBackHello')}{' '}
          <span className="text-accent">{customer.name.toUpperCase().split(' ')[0]}</span>{' '}
          <span aria-hidden="true">👋</span>
          {stats && (
            <span className="font-mono text-[10px] tracking-[0.15em] text-neutral-400 ml-2 align-middle">
              {visitLabel(lang, stats.totalVisits + 1)}
            </span>
          )}
        </p>
        <h1 className="font-display text-3xl leading-[0.95] mt-4 xd-rise xd-d3">{t(lang, 'beforeYouTrain')}</h1>

        {/* Rule 1: RE-RACK — v2.13: big solid-yellow number heads each rule;
            the number replaces the old in-card yellow bar (which duplicated
            the rule title). Cards reveal on scroll. Images untouched. */}
        <XdReveal>
          <div className="flex items-baseline gap-3 mt-5 mb-2.5">
            <span className="font-display text-[28px] leading-none text-accent">01</span>
            <span className="font-display text-[15px] tracking-wide">{ruleTitle(t(lang, 'rule1'))}</span>
          </div>
          <div className="border border-ink-line mb-4 overflow-hidden">
            <div className="bg-black">
              <Image
                src="/rerack.webp"
                alt="RE-RACK"
                width={740}
                height={740}
                className="w-full h-auto"
                priority
              />
            </div>
          </div>
        </XdReveal>

        {/* Rule 2: NO SLIPPERS */}
        <XdReveal>
          <div className="flex items-baseline gap-3 mt-1 mb-2.5">
            <span className="font-display text-[28px] leading-none text-accent">02</span>
            <span className="font-display text-[15px] tracking-wide">{ruleTitle(t(lang, 'rule2'))}</span>
          </div>
          <div className="border border-ink-line mb-4 overflow-hidden">
            <div className="bg-black">
              <Image
                src="/no-slippers.webp"
                alt="NO SLIPPERS"
                width={690}
                height={260}
                className="w-full h-auto"
                priority
              />
            </div>
          </div>
        </XdReveal>

        {/* DO */}
        <XdReveal>
        <div className="border border-ink-line mb-4 overflow-hidden">
          <div className="bg-black">
            <Image
              src="/do.webp"
              alt="DO — gym etiquette"
              width={1080}
              height={1080}
              className="w-full h-auto"
            />
          </div>
        </div>
        </XdReveal>

        {/* DON'T */}
        <XdReveal>
        <div className="border border-ink-line mb-5 overflow-hidden">
          <div className="bg-black">
            <Image
              src="/dont.webp"
              alt="DON'T — gym etiquette"
              width={1080}
              height={1080}
              className="w-full h-auto"
            />
          </div>
        </div>
        </XdReveal>

        {/* CTA — comes BEFORE T&C now (Option C). The CTA is the highest
            priority thing on this page; users have already agreed to T&C
            at registration. data-scroll-target tells ScrollHint where to
            scroll to on mount (so the button is visible above the fold). */}
        <XdReveal>
        <div className="checkin-cta-wrap" data-scroll-target>
          {!loading && (
            <span className="checkin-cta-finger" aria-hidden="true">👇</span>
          )}
          <button
            onClick={handleAcknowledge}
            disabled={loading}
            className={`btn-checkin-cta ${
              lang === 'zh' ? 'btn-checkin-cta-zh' : ''
            }`}
          >
            {loading ? (
              <span className="flex gap-1.5 justify-center">
                <span className="loading-dot inline-block w-2 h-2 bg-ink rounded-full" />
                <span className="loading-dot inline-block w-2 h-2 bg-ink rounded-full" />
                <span className="loading-dot inline-block w-2 h-2 bg-ink rounded-full" />
              </span>
            ) : (
              <>{t(lang, 'acknowledge')} →</>
            )}
          </button>
        </div>
        </XdReveal>

        {errorMsg && (
          <div className="bg-danger text-bone px-4 py-3 mt-4 font-display text-sm tracking-wider animate-shake">
            {errorMsg}
          </div>
        )}

        {/* T&C — small underlined link below the CTA. Customers already
            agreed at registration, so this is reference-only. Keeping it
            visible (just less prominent) preserves the "always available"
            promise without competing with the CTA. */}
        <button
          type="button"
          onClick={() => setShowTerms(true)}
          className="w-full mt-4 text-center text-[12.5px] hover:opacity-80 transition-opacity"
        >
          <span className="text-accent underline underline-offset-4">{t(lang, 'viewTerms')}</span>
        </button>

        {/* Bottom spacer — gives users a visual cue that page has ended,
            and prevents the CTA from being flush with bottom edge.
            Important UX: when content ends right at screen bottom, users
            don't realize they need to scroll. */}
        <div className="h-20" aria-hidden="true" />
      </section>

      {/* T&C modal popup */}
      <TermsModal open={showTerms} onClose={() => setShowTerms(false)} />

      {/* Scroll-down hint at bottom of viewport — auto-hides once user
          reaches the bottom or has scrolled past 200px */}
      <ScrollHint />
    </main>
  );
}

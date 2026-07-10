'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@/lib/supabase-client';
import { Lang, t } from '@/lib/i18n';
import { Customer } from '@/lib/types';
import { parseTimestamp } from '@/lib/utils';
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
    // Filter by `ic` not `customer_id` because anon's column-level grant on
    // visits is (ic, visited_at, status) — `customer_id` is admin-only.
    (async () => {
      const { data: visits } = await supabase
        .from('visits')
        .select('visited_at')
        .eq('ic', c.ic)
        .eq('status', 'approved')
        .order('visited_at', { ascending: false });

      if (visits && visits.length > 0) {
        setStats({
          totalVisits: visits.length,
          lastVisitAt: visits[0].visited_at,
        });
      } else {
        setStats({ totalVisits: 0, lastVisitAt: null });
      }
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
    router.push('/checkin/approved');
  };

  if (!customer) return null;

  // Format last-visit date in user's language
  const formatLastVisit = (iso: string) => {
    const d = parseTimestamp(iso);
    if (!d) return '';
    const datePart = d.toLocaleDateString(
      lang === 'zh' ? 'zh-CN' : lang === 'ms' ? 'ms-MY' : 'en-MY',
      { year: 'numeric', month: 'short', day: '2-digit', timeZone: 'Asia/Kuala_Lumpur' }
    );
    const timePart = d.toLocaleTimeString('en-MY', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Kuala_Lumpur',
    });
    return `${datePart} · ${timePart}`;
  };

  return (
    <main className="min-h-screen flex flex-col bg-ink relative">
      <Atmo />

      <CheckinHeader className="xd-rise xd-d1" />

      <StepRail step={2} className="xd-rise xd-d1" />

      <section className="flex-1 px-5 py-6 max-w-md mx-auto w-full relative z-[2]">
        {/* HELLO, RON — compact stack (replaces the v2.5 yellow-bordered
            card). HELLO line stays bold/big to keep the personalized feel,
            but ditching the box saves ~110px and lets the user see the
            CTA much sooner. visit-stats sits inline as a single mono line. */}
        <div className="xd-hello mb-6 xd-rise xd-d2">
          <p className="font-mono text-[10px] tracking-[0.3em] text-accent mb-1">
            // {t(lang, 'welcomeBack')}
          </p>
          <h2 className="font-display text-2xl leading-none mb-2">
            {t(lang, 'welcomeBackHello')}{' '}
            <span className="text-accent">{customer.name.toUpperCase().split(' ')[0]}</span>
          </h2>
          {stats && stats.lastVisitAt && (
            <p className="font-mono text-[10px] text-neutral-400 leading-relaxed">
              {t(lang, 'lastVisit')}: {formatLastVisit(stats.lastVisitAt)}
              {' · '}
              {t(lang, 'totalVisits')}: <span className="text-accent">{stats.totalVisits}</span>
            </p>
          )}
        </div>

        <div className="mb-4 xd-rise xd-d3">
          <p className="font-mono text-[10px] tracking-[0.3em] text-accent mb-2">
            // {t(lang, 'gymRulesReminder')}
          </p>
          <h1 className="font-display text-3xl md:text-4xl leading-[0.9] mb-2">
            {t(lang, 'beforeYouTrain')}
          </h1>
          <div className="xd-ubar" />
        </div>

        {/* IMPORTANT RULES — section label grouping the two core rules
            (RE-RACK + NO SLIPPERS). Added v2.8.1. */}
        <div className="inline-block bg-accent/10 border border-accent text-accent font-mono text-[10px] tracking-[0.25em] px-2.5 py-1 mb-1 xd-rise xd-d4">
          ▎ {t(lang, 'importantRules')}
        </div>

        {/* Rule 1: RE-RACK — v2.13: big solid-yellow number heads each rule;
            the number replaces the old in-card yellow bar (which duplicated
            the rule title). Cards reveal on scroll. Images untouched. */}
        <XdReveal>
          <div className="flex items-baseline gap-3 mt-4 mb-2.5">
            <span className="font-display text-[28px] leading-none text-accent">01</span>
            <span className="font-display text-[15px] tracking-wide">{ruleTitle(t(lang, 'rule1'))}</span>
          </div>
          <div className="border border-ink-line mb-4 overflow-hidden">
            <div className="bg-black">
              <Image
                src="/rerack.png"
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
          <div className="border border-ink-line mb-5 overflow-hidden">
            <div className="bg-black">
              <Image
                src="/no-slippers.png"
                alt="NO SLIPPERS"
                width={690}
                height={250}
                className="w-full h-auto"
                priority
              />
            </div>
          </div>
        </XdReveal>

        {/* DO & DON'T — full visual etiquette guide (1080×1080 graphics).
            Added v2.8.1. The images are self-contained (green DO / red
            DON'T headers baked in), so no yellow rule-bar is added; they
            sit in the same bordered frame as the rules above for visual
            consistency. Not marked `priority` (below the fold). */}
        <XdReveal>
        <div className="mt-3 mb-3">
          <p className="font-mono text-[10px] tracking-[0.3em] text-accent mb-1.5">
            // {t(lang, 'doAndDont')}
          </p>
          <h2 className="font-display text-2xl leading-none">
            <span className="text-success-green">DO</span>
            <span className="text-neutral-500"> &amp; </span>
            <span className="text-danger">DON&apos;T</span>
          </h2>
        </div>
        </XdReveal>

        {/* DO */}
        <XdReveal>
        <div className="border border-ink-line mb-4 overflow-hidden">
          <div className="bg-black">
            <Image
              src="/do.png"
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
              src="/dont.png"
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
          className="w-full mt-4 text-center text-[11px] text-neutral-400 hover:text-accent transition-colors"
        >
          {t(lang, 'viewTermsSub')}{' · '}
          <span className="text-accent underline underline-offset-4 font-mono tracking-wider">
            {t(lang, 'viewTerms')}
          </span>
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

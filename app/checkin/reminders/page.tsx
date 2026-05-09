'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@/lib/supabase-client';
import { Lang, t } from '@/lib/i18n';
import { Customer } from '@/lib/types';
import CheckinHeader from '@/components/CheckinHeader';
import TermsModal from '@/components/TermsModal';
import ScrollHint from '@/components/ScrollHint';

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
    const savedLang = sessionStorage.getItem('xf-lang') as Lang | null;
    if (savedLang) setLang(savedLang);

    const data = sessionStorage.getItem('xf-customer');
    if (!data) {
      router.replace('/checkin');
      return;
    }
    const c: Customer = JSON.parse(data);
    setCustomer(c);

    // Fetch visit stats (best-effort, non-blocking).
    // We filter by ic (not customer_id) because anon's column-level
    // grant on visits is (ic, visited_at, status) — the customer_id
    // column is admin-only.
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

    sessionStorage.setItem('xf-success-name', customer.name);
    router.push('/checkin/approved');
  };

  if (!customer) return null;

  // Format last-visit date in user's language
  const formatLastVisit = (iso: string) => {
    const d = new Date(iso);
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
    <main className="min-h-screen flex flex-col bg-ink">
      <CheckinHeader />

      <section className="flex-1 px-5 py-6 max-w-md mx-auto w-full">
        {/* HELLO, RON — compact stack (replaces the v2.5 yellow-bordered
            card). HELLO line stays bold/big to keep the personalized feel,
            but ditching the box saves ~110px and lets the user see the
            CTA much sooner. visit-stats sits inline as a single mono line. */}
        <div className="mb-5">
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

        <div className="mb-4">
          <p className="font-mono text-[10px] tracking-[0.3em] text-accent mb-2">
            // {t(lang, 'gymRulesReminder')}
          </p>
          <h1 className="font-display text-3xl md:text-4xl leading-[0.9] mb-2">
            {t(lang, 'beforeYouTrain')}
          </h1>
          <div className="h-1 w-16 bg-accent" />
        </div>

        {/* Rule 1: RE-RACK */}
        <div className="border-2 border-ink-line mb-4 overflow-hidden">
          <div className="bg-accent text-ink px-4 py-2 font-display text-xs tracking-widest flex items-center gap-2">
            ⚠ {t(lang, 'rule1')}
          </div>
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

        {/* Rule 2: NO SLIPPERS */}
        <div className="border-2 border-ink-line mb-5 overflow-hidden">
          <div className="bg-accent text-ink px-4 py-2 font-display text-xs tracking-widest flex items-center gap-2">
            ⚠ {t(lang, 'rule2')}
          </div>
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

        {/* CTA — comes BEFORE T&C now (Option C). The CTA is the highest
            priority thing on this page; users have already agreed to T&C
            at registration. data-scroll-target tells ScrollHint where to
            scroll to on mount (so the button is visible above the fold). */}
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

'use client';

// ===========================================================================
// /report — public landing (language select) — WARM WHITE theme (v2.12)
// Pre-language-selection page: hero copy stays English (same as v2.11),
// the choose-language line is trilingual inline.
// ===========================================================================

import { useRouter } from 'next/navigation';
import { Lang } from '@/lib/i18n';
import { WHATSAPP_URL } from '@/lib/report-config';
import { safeLocal, safeSession } from '@/lib/safe-storage';
import { ReportBrand, ShieldHeart, WaCard } from '@/components/ReportUI';

const LANGS: { code: Lang; label: string; sub: string }[] = [
  { code: 'en', label: 'English', sub: 'CONTINUE IN ENGLISH' },
  { code: 'zh', label: '中文', sub: 'CHINESE' },
  { code: 'ms', label: 'Bahasa Melayu', sub: 'TERUSKAN DALAM BM' },
];

export default function ReportLandingPage() {
  const router = useRouter();

  const choose = (lang: Lang) => {
    safeLocal.setItem('xf-lang', lang);
    safeSession.setItem('xf-report-lang', lang);
    router.push('/report/form');
  };

  return (
    <main className="report-light min-h-screen flex flex-col">
      <header className="rl-hdr">
        <ReportBrand />
      </header>

      {/* HERO — v2.17 flat redesign: outline shield, gold-accent big line,
          empathetic reassure. No glow, no highlight bar. */}
      <div className="rl-glow text-center px-7 pt-8 pb-1">
        <div className="rl-rise rl-d1">
          <ShieldHeart size={84} />
        </div>
        <p className="rl-rise rl-d2 rl-q2 text-[20px] leading-[1.45] mt-[30px] mb-0">
          Feeling unsafe or uncomfortable?
        </p>
        <h1 className="rl-rise rl-d3 rl-big text-[50px] leading-[1.08] mt-2.5 mb-0">
          It&rsquo;s okay to
          <span className="rl-big-accent block">speak up</span>
        </h1>
        <p className="rl-rise rl-d4 rl-reassure">
          Been followed, watched, or made to feel unsafe at the gym?{' '}
          <b>You&rsquo;re not overreacting.</b> Tell us &mdash; and we&rsquo;ll stand with you
        </p>
        <div className="rl-rise rl-d5 mt-6">
          <span className="rl-trust2">
            <span className="rl-trust-dot" />
            100% CONFIDENTIAL · MANAGEMENT ONLY
          </span>
        </div>
      </div>

      {/* LANGUAGE SELECT */}
      <section className="px-6 pt-2 pb-11 max-w-md mx-auto w-full">
        <p
          className="rl-rise rl-d5 font-mono text-[10px] tracking-[0.2em] text-center mt-5 mb-3.5"
          style={{ color: 'var(--rl-faint)' }}
        >
          CHOOSE YOUR LANGUAGE · 选择语言 · PILIH BAHASA
        </p>

        {LANGS.map((l, i) => (
          <button
            key={l.code}
            onClick={() => choose(l.code)}
            className={`rl-langbtn rl-rise ${i === 0 ? 'rl-d5' : 'rl-d6'}`}
          >
            <div>
              <div className="font-display text-[19px]">{l.label}</div>
              <div className="font-mono text-[9.5px] tracking-[0.14em] mt-0.5" style={{ color: 'var(--rl-faint)' }}>
                {l.sub}
              </div>
            </div>
            <span className="rl-arrow">→</span>
          </button>
        ))}

        {/* WhatsApp — talk to a person instead */}
        <div className="rl-rise rl-d6 mt-5">
          <WaCard
            title="Prefer to talk to a person?"
            sub="WhatsApp our management directly."
            cta="CHAT"
            href={WHATSAPP_URL}
          />
        </div>

        <p
          className="text-center font-mono text-[9px] tracking-[0.12em] mt-5 leading-[1.8]"
          style={{ color: 'var(--rl-faint)' }}
        >
          🔒 SEEN BY X FITNESS MANAGEMENT ONLY
        </p>
      </section>
    </main>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { Lang } from '@/lib/i18n';
import { safeLocal, safeSession } from '@/lib/safe-storage';
import BrandMark from '@/components/BrandMark';

const LANGS: { code: Lang; label: string; sub?: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'zh', label: '中文', sub: 'CHINESE' },
  { code: 'ms', label: 'Bahasa Melayu' },
];

export default function ReportLandingPage() {
  const router = useRouter();

  const choose = (lang: Lang) => {
    safeLocal.setItem('xf-lang', lang);
    safeSession.setItem('xf-report-lang', lang);
    router.push('/report/form');
  };

  return (
    <main className="min-h-screen flex flex-col bg-ink">
      {/* header */}
      <header className="flex items-center justify-center px-5 py-3.5 border-b border-ink-line">
        <BrandMark size="sm" />
      </header>

      {/* HERO — same warm hero as the form */}
      <div className="px-6 pt-8 pb-6 text-center bg-[radial-gradient(125%_80%_at_50%_0%,rgba(255,180,168,0.13),rgba(255,214,10,0.05)_45%,transparent_74%)]">
        <svg width="60" height="60" viewBox="0 0 48 48" fill="none" className="mx-auto mb-4" aria-hidden="true">
          <path
            d="M24 4l16 6v11c0 10-6.8 18.3-16 21-9.2-2.7-16-11-16-21V10l16-6z"
            fill="rgba(255,214,10,.10)"
            stroke="#FFD60A"
            strokeWidth="2"
          />
          <path
            d="M24 20.5c-1.6-3-6.5-2.6-6.5 1.4 0 3 3.4 5.3 6.5 7.6 3.1-2.3 6.5-4.6 6.5-7.6 0-4-4.9-4.4-6.5-1.4z"
            fill="#ffb4a8"
          />
        </svg>
        <p className="font-body font-semibold text-[22px] leading-tight text-[#f3e9e7]">
          Feels unsafe?
          <br />
          Feels uncomfortable?
        </p>
        <p className="font-display text-[25px] leading-none text-accent mt-2">We are here to help.</p>
        <p className="text-[13px] leading-relaxed text-neutral-400 mt-4 max-w-[310px] mx-auto">
          If something at X FITNESS made you feel unsafe or uncomfortable, please tell us. Every
          report is taken seriously.
        </p>
        <div className="flex items-center justify-center gap-2 mt-5 font-mono text-[10px] tracking-wider text-success-green">
          <span className="w-1.5 h-1.5 rounded-full bg-success-green shadow-[0_0_8px_#16c75b]" />
          100% CONFIDENTIAL · MANAGEMENT ONLY
        </div>
      </div>

      <div className="h-px bg-ink-line mx-6" />

      {/* language selection */}
      <section className="px-6 pt-7 pb-10 max-w-md mx-auto w-full">
        <p className="font-mono text-[10px] tracking-[0.22em] text-neutral-500 text-center mb-5 leading-relaxed">
          CHOOSE YOUR LANGUAGE · 选择语言 · PILIH BAHASA
        </p>

        <div className="space-y-3">
          {LANGS.map((l) => (
            <button
              key={l.code}
              onClick={() => choose(l.code)}
              className="relative w-full bg-ink-soft border-2 border-ink-line rounded-xl py-4 font-display text-xl tracking-wide text-bone hover:border-accent hover:text-accent transition-all active:translate-y-0.5 flex items-center justify-center gap-3"
            >
              {l.label}
              {l.sub && (
                <span className="font-mono text-[10px] tracking-[0.15em] opacity-55 font-normal">
                  {l.sub}
                </span>
              )}
              <span className="absolute right-5 font-display text-lg opacity-50">→</span>
            </button>
          ))}
        </div>

        <p className="text-center font-mono text-[9px] tracking-[0.1em] text-neutral-600 mt-6 leading-relaxed">
          🔒 SEEN BY X FITNESS MANAGEMENT ONLY
        </p>
      </section>
    </main>
  );
}

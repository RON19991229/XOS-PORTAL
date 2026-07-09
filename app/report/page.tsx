'use client';

import { useRouter } from 'next/navigation';
import { Lang } from '@/lib/i18n';
import { reportCopy } from '@/lib/report-config';
import { safeLocal, safeSession } from '@/lib/safe-storage';
import BrandMark from '@/components/BrandMark';

const LANGS: { code: Lang; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'zh', label: '中文' },
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
      <section className="flex-1 flex flex-col items-center justify-center px-5 py-10 max-w-md mx-auto w-full">
        {/* soft supportive glow */}
        <div className="w-full text-center">
          <div className="flex justify-center mb-6">
            <BrandMark size="lg" />
          </div>

          {/* shield-heart */}
          <svg
            width="56"
            height="56"
            viewBox="0 0 48 48"
            fill="none"
            className="mx-auto mb-6"
            aria-hidden="true"
          >
            <path
              d="M24 4l16 6v11c0 10-6.8 18.3-16 21-9.2-2.7-16-11-16-21V10l16-6z"
              fill="rgba(255,214,10,.08)"
              stroke="#FFD60A"
              strokeWidth="2"
            />
            <path
              d="M24 20.5c-1.6-3-6.5-2.6-6.5 1.4 0 3 3.4 5.3 6.5 7.6 3.1-2.3 6.5-4.6 6.5-7.6 0-4-4.9-4.4-6.5-1.4z"
              fill="#ffb4a8"
            />
          </svg>

          {/* reassuring line in all three languages (they haven't chosen yet) */}
          <div className="space-y-2.5 mb-9">
            <p className="text-sm text-neutral-300 leading-relaxed">{reportCopy.en.landingLine}</p>
            <p className="text-sm text-neutral-400 leading-relaxed">{reportCopy.zh.landingLine}</p>
            <p className="text-sm text-neutral-400 leading-relaxed">{reportCopy.ms.landingLine}</p>
          </div>

          <p className="font-mono text-[10px] tracking-[0.3em] text-neutral-500 mb-4">
            {reportCopy.en.chooseLanguage.toUpperCase()} · 选择语言 · PILIH BAHASA
          </p>

          <div className="space-y-3">
            {LANGS.map((l) => (
              <button
                key={l.code}
                onClick={() => choose(l.code)}
                className="w-full bg-ink-soft border-2 border-ink-line py-4 font-display text-xl tracking-wide transition-all hover:border-accent hover:text-accent active:translate-y-0.5"
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

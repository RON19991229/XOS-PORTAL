'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lang, t } from '@/lib/i18n';
import { safeSession } from '@/lib/safe-storage';

export default function UnderAgePage() {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>('en');

  useEffect(() => {
    const savedLang = safeSession.getItem('xf-lang') as Lang | null;
    if (savedLang) setLang(savedLang);

    const timeout = setTimeout(() => {
      safeSession.clear();
      router.replace('/checkin');
    }, 15000);

    return () => clearTimeout(timeout);
  }, [router]);

  return (
    <main className="min-h-screen bg-danger text-bone flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 text-center">
        <div className="animate-slam mb-6">
          <div className="w-32 h-32 md:w-40 md:h-40 bg-ink text-danger flex items-center justify-center text-7xl md:text-8xl font-display border-8 border-bone -rotate-3">
            ✕
          </div>
        </div>

        <p className="font-mono text-xs tracking-[0.3em] mb-3 opacity-80 animate-slam"
          style={{ animationDelay: '0.1s', animationFillMode: 'both', opacity: 0 }}>
          // {t(lang, 'underAge')}
        </p>

        <h1 className="font-display leading-[0.85] tracking-tighter mb-4 animate-slam w-full px-2"
          style={{
            animationDelay: '0.2s',
            animationFillMode: 'both',
            opacity: 0,
            fontSize: 'clamp(2rem, 10vw, 6rem)',
            wordBreak: 'break-word',
          }}>
          {t(lang, 'under12Title')}
        </h1>

        <p className="font-display text-lg md:text-xl tracking-wider max-w-md mt-4 animate-slam"
          style={{ animationDelay: '0.3s', animationFillMode: 'both', opacity: 0 }}>
          {t(lang, 'under12Msg')}
        </p>
      </div>
    </main>
  );
}

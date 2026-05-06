'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lang, t } from '@/lib/i18n';
import BrandMark from '@/components/BrandMark';
import LanguageToggle from '@/components/LanguageToggle';

export default function CheckinPage() {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>('en');

  useEffect(() => {
    const saved = localStorage.getItem('xf-lang') as Lang | null;
    if (saved && ['en', 'zh', 'ms'].includes(saved)) setLang(saved);

    sessionStorage.removeItem('xf-customer');
    sessionStorage.removeItem('xf-ic');
    sessionStorage.removeItem('xf-success-name');
  }, []);

  const handleLangChange = (l: Lang) => {
    setLang(l);
    localStorage.setItem('xf-lang', l);
  };

  const choose = (nationality: 'malaysian' | 'foreigner') => {
    sessionStorage.setItem('xf-nationality', nationality);
    sessionStorage.setItem('xf-lang', lang);
    router.push('/checkin/id-input');
  };

  return (
    <main className="min-h-screen flex flex-col bg-ink">
      <header className="flex items-center justify-end px-5 py-3 border-b border-ink-line">
        <LanguageToggle current={lang} onChange={handleLangChange} />
      </header>

      <section className="flex-1 flex flex-col justify-center px-5 py-6 max-w-md mx-auto w-full">
        {/* Big logo at top */}
        <div className="flex justify-center mb-6">
          <BrandMark size="xl" />
        </div>

        <div className="mb-8 text-center">
          <p className="font-mono text-[10px] tracking-[0.3em] text-neutral-500 mb-3">
            // {t(lang, 'walkInCheckIn')}
          </p>
          <h1 className="font-display text-4xl md:text-5xl leading-[0.85] mb-3">
            {t(lang, 'welcome')}
          </h1>
          <div className="h-1 w-16 bg-accent mx-auto mb-5" />
          <p className="font-display text-sm md:text-base text-bone leading-snug">
            {t(lang, 'taglinePrimary')}
          </p>
          <p className="font-mono text-[11px] text-neutral-500 mt-1.5">
            {t(lang, 'taglineSecondary')}
          </p>
        </div>

        <p className="font-display text-xs tracking-[0.2em] text-neutral-500 mb-4 text-center">
          {t(lang, 'chooseNationality')}
        </p>

        <button
          onClick={() => choose('malaysian')}
          className="w-full bg-ink-soft border-2 border-ink-line p-6 mb-3 text-left transition-all hover:border-accent active:translate-y-0.5"
        >
          <div className="text-3xl mb-1">🇲🇾</div>
          <div className="font-display text-2xl mb-1">{t(lang, 'malaysian')}</div>
          <div className="font-mono text-[10px] text-neutral-500 tracking-wider">
            {t(lang, 'icSubtitle')}
          </div>
        </button>

        <button
          onClick={() => choose('foreigner')}
          className="w-full bg-ink-soft border-2 border-ink-line p-6 text-left transition-all hover:border-accent active:translate-y-0.5"
        >
          <div className="text-3xl mb-1">🌍</div>
          <div className="font-display text-2xl mb-1">{t(lang, 'foreigner')}</div>
          <div className="font-mono text-[10px] text-neutral-500 tracking-wider">
            {t(lang, 'passportSubtitle')}
          </div>
        </button>
      </section>
    </main>
  );
}

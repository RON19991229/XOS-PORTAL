'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lang, t } from '@/lib/i18n';
import BrandMark from '@/components/BrandMark';
import LanguageToggle from '@/components/LanguageToggle';
import TaglineMarquee from '@/components/TaglineMarquee';
import ScrollHint from '@/components/ScrollHint';

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

      <section className="flex-1 flex flex-col px-5 py-6 max-w-md mx-auto w-full">
        {/* Logo at top */}
        <div className="flex justify-center mb-4">
          <BrandMark size="lg" />
        </div>

        {/* WELCOME heading (smaller per user request — 36px) */}
        <div className="mb-2 text-center">
          <p className="font-mono text-[10px] tracking-[0.3em] text-neutral-500 mb-2">
            // {t(lang, 'walkInCheckIn')}
          </p>
          <h1 className="font-display leading-[0.88] tracking-tighter" style={{ fontSize: '36px' }}>
            {t(lang, 'welcome')}
          </h1>
          <div className="h-1 w-14 bg-accent mx-auto mt-3" />
        </div>

        {/* Trilingual rotating marquee */}
        <TaglineMarquee />

        <p className="font-mono text-[10px] tracking-[0.3em] text-neutral-500 mb-3 text-center">
          {t(lang, 'chooseNationality')}
        </p>

        <button
          onClick={() => choose('malaysian')}
          className="w-full bg-ink-soft border-2 border-ink-line p-5 mb-3 text-left transition-all hover:border-accent active:translate-y-0.5"
        >
          <div className="text-2xl mb-1">🇲🇾</div>
          <div className="font-display text-2xl mb-1">{t(lang, 'malaysian')}</div>
          <div className="font-mono text-[10px] text-neutral-500 tracking-wider">
            {t(lang, 'icSubtitle')}
          </div>
        </button>

        <button
          onClick={() => choose('foreigner')}
          className="w-full bg-ink-soft border-2 border-ink-line p-5 text-left transition-all hover:border-accent active:translate-y-0.5"
        >
          <div className="text-2xl mb-1">🌍</div>
          <div className="font-display text-2xl mb-1">{t(lang, 'foreigner')}</div>
          <div className="font-mono text-[10px] text-neutral-500 tracking-wider">
            {t(lang, 'passportSubtitle')}
          </div>
        </button>

        {/* Bottom spacer — prevents the last button from being flush with
            the screen edge, which was causing customers to think the page
            had ended (and not realize they could scroll). */}
        <div className="h-20" aria-hidden="true" />
      </section>

      {/* ScrollHint — auto-hides if the page already fits in the viewport */}
      <ScrollHint />
    </main>
  );
}

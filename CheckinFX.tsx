'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import { Lang, t } from '@/lib/i18n';
import { Customer } from '@/lib/types';
import { safeSession, safeJsonParse } from '@/lib/safe-storage';

export default function BannedPage() {
  const router = useRouter();
  const supabase = createClient();
  const [lang, setLang] = useState<Lang>('en');
  const [customer, setCustomer] = useState<Customer | null>(null);

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

    // Log denied attempt
    supabase
      .from('visits')
      .insert({
        customer_id: c.id,
        ic: c.ic,
        status: 'denied_banned',
      })
      .then(() => {});

    const timeout = setTimeout(() => {
      safeSession.clear();
      router.replace('/checkin');
    }, 20000);

    return () => clearTimeout(timeout);
  }, [router, supabase]);

  if (!customer) return null;

  return (
    <main className="min-h-screen bg-danger text-bone flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 text-center">
        <div className="animate-slam mb-6">
          <div className="w-32 h-32 md:w-40 md:h-40 bg-ink text-danger flex items-center justify-center text-7xl md:text-8xl font-display border-8 border-bone rotate-3">
            ✕
          </div>
        </div>

        <p className="font-mono text-xs tracking-[0.3em] mb-3 opacity-90 animate-slam"
          style={{ animationDelay: '0.1s', animationFillMode: 'both', opacity: 0 }}>
          {t(lang, 'statusDenied')}
        </p>

        <h1 className="font-display leading-[0.85] tracking-tighter mb-4 animate-slam w-full px-2"
          style={{
            animationDelay: '0.2s',
            animationFillMode: 'both',
            opacity: 0,
            fontSize: 'clamp(2.5rem, 11vw, 8rem)',
            wordBreak: 'break-word',
          }}>
          {t(lang, 'banned')}
        </h1>

        <div className="bg-bone text-ink px-6 py-3 mb-6 inline-block animate-slam"
          style={{ animationDelay: '0.3s', animationFillMode: 'both', opacity: 0 }}>
          <p className="font-display text-xl md:text-2xl tracking-wider">
            {customer.name.toUpperCase()}
          </p>
        </div>

        <p className="font-display text-lg md:text-xl tracking-wider max-w-md animate-slam mb-2"
          style={{ animationDelay: '0.4s', animationFillMode: 'both', opacity: 0 }}>
          {t(lang, 'bannedSub')}
        </p>

        <p className="font-display text-base md:text-lg tracking-wider max-w-md animate-slam opacity-90"
          style={{ animationDelay: '0.5s', animationFillMode: 'both', opacity: 0 }}>
          {t(lang, 'bannedContact')}
        </p>

        <div className="font-mono text-xs opacity-60 mt-6">
          REF: {customer.ic} · {new Date().toISOString().split('T')[0]}
        </div>
      </div>
    </main>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lang, t } from '@/lib/i18n';
import { formatDateTime } from '@/lib/utils';

/**
 * APPROVED — Full-screen green page (per user request 2026-05-06).
 *
 * Design notes:
 *   - Full-bleed green (#16c75b) so it's visible from across the gym.
 *   - Black ✓ box rotated -3° to keep X FITNESS visual identity.
 *   - All text in black (max contrast on green).
 *   - Auto-redirects to /checkin after 12 seconds.
 */
export default function ApprovedPage() {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>('en');
  const [name, setName] = useState('');
  const [now, setNow] = useState('');

  useEffect(() => {
    const savedLang = sessionStorage.getItem('xf-lang') as Lang | null;
    const savedName = sessionStorage.getItem('xf-success-name');

    if (!savedName) {
      router.replace('/checkin');
      return;
    }
    if (savedLang) setLang(savedLang);
    setName(savedName);
    setNow(formatDateTime(new Date()));

    const timeout = setTimeout(() => {
      sessionStorage.clear();
      router.replace('/checkin');
    }, 12000);

    return () => clearTimeout(timeout);
  }, [router]);

  return (
    <main className="min-h-screen bg-success-green text-ink flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 text-center">
        {/* Black tilted ✓ box — keeps X FITNESS brand language */}
        <div
          className="animate-slam mb-7"
          style={{ animationDelay: '0s', animationFillMode: 'both' }}
        >
          <div className="w-32 h-32 md:w-40 md:h-40 bg-ink text-success-green flex items-center justify-center text-7xl md:text-8xl font-display -rotate-3">
            ✓
          </div>
        </div>

        <p
          className="font-mono text-xs tracking-[0.3em] text-ink mb-3 animate-slam"
          style={{ animationDelay: '0.1s', animationFillMode: 'both', opacity: 0 }}
        >
          {t(lang, 'statusActive')}
        </p>

        <h1
          className="font-display text-4xl md:text-5xl leading-[0.9] tracking-tighter mb-6 animate-slam max-w-md text-ink"
          style={{ animationDelay: '0.2s', animationFillMode: 'both', opacity: 0 }}
        >
          WALK-IN
          <br />
          ACCESS
          <br />
          APPROVED
        </h1>

        <div
          className="bg-ink text-bone px-6 py-3 mb-8 inline-block animate-slam"
          style={{ animationDelay: '0.3s', animationFillMode: 'both', opacity: 0 }}
        >
          <p className="font-display text-xl md:text-2xl tracking-wider">
            {name.toUpperCase()}
          </p>
        </div>

        <p
          className="font-display text-sm md:text-base tracking-wider max-w-md text-ink animate-slam mb-2"
          style={{ animationDelay: '0.4s', animationFillMode: 'both', opacity: 0 }}
        >
          {t(lang, 'approvedSub')}
        </p>

        <p className="font-mono text-xs text-ink/60 mt-4">{now}</p>
      </div>
    </main>
  );
}

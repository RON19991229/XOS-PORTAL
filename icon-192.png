'use client';

import { Lang } from '@/lib/i18n';

interface LanguageToggleProps {
  current: Lang;
  onChange: (lang: Lang) => void;
  /** 'dark' (default) = existing checkin style; 'light' = warm-white /report style */
  variant?: 'dark' | 'light';
}

export default function LanguageToggle({ current, onChange, variant = 'dark' }: LanguageToggleProps) {
  const langs: { code: Lang; label: string }[] = [
    { code: 'en', label: 'EN' },
    { code: 'zh', label: '中' },
    { code: 'ms', label: 'BM' },
  ];

  if (variant === 'light') {
    return (
      <div className="rl-lang-toggle">
        {langs.map((l) => (
          <button key={l.code} onClick={() => onChange(l.code)} className={current === l.code ? 'on' : ''}>
            {l.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="inline-flex border border-neutral-700">
      {langs.map((l) => (
        <button
          key={l.code}
          onClick={() => onChange(l.code)}
          className={`px-3 py-1.5 font-display text-xs tracking-wider transition-colors ${
            current === l.code
              ? 'bg-accent text-ink'
              : 'text-neutral-400 hover:text-bone'
          }`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}

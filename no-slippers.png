'use client';

import { ReactNode } from 'react';
import LanguageToggle from './LanguageToggle';
import { CheckinBrand } from './CheckinFX';
import { Lang } from '@/lib/i18n';

interface CheckinHeaderProps {
  lang?: Lang;
  onLangChange?: (l: Lang) => void;
  rightSlot?: ReactNode;
  /** Extra classes (e.g. xd-rise xd-d1 for entrance stagger) */
  className?: string;
}

/**
 * v2.13: brand upgraded from the old lone logo.png to the report-style
 * tile + wordmark (CheckinBrand), matching /report pages. Border softened.
 */
export default function CheckinHeader({ lang, onLangChange, rightSlot, className = '' }: CheckinHeaderProps) {
  return (
    <header
      className={`flex items-center justify-between px-5 py-3 border-b border-ink-line/70 bg-ink relative z-10 ${className}`}
    >
      <CheckinBrand />
      {lang && onLangChange ? (
        <LanguageToggle current={lang} onChange={onLangChange} />
      ) : rightSlot ? (
        rightSlot
      ) : null}
    </header>
  );
}

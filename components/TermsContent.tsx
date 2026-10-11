'use client';

// v2.23.0 — scroll progress bar, bottom fade and a "scroll to read / read ✓"
// footer. Full text is unchanged (legal requirement): every section is shown.

import { useRef, useState } from 'react';
import { termsIntro, termsSections } from '@/lib/terms';

interface TermsContentProps {
  scrollLabel?: string;
  readLabel?: string;
}

export default function TermsContent({ scrollLabel = 'SCROLL TO READ ↓', readLabel = 'READ ✓' }: TermsContentProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [readAll, setReadAll] = useState(false);

  const onScroll = () => {
    const el = bodyRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    const p = max > 0 ? Math.min(1, el.scrollTop / max) : 1;
    setProgress(p);
    if (p > 0.97) setReadAll(true);
  };

  return (
    <div className="relative bg-ink-soft border-2 border-ink-line">
      <div
        ref={bodyRef}
        onScroll={onScroll}
        className="max-h-60 overflow-y-auto p-4 pb-8 text-sm leading-relaxed"
      >
        <p className="font-display text-xs tracking-widest text-neutral-400 mb-2">
          INTRODUCTION
        </p>
        <p className="text-neutral-300 mb-4 whitespace-pre-line text-sm">
          {termsIntro}
        </p>

        <ol className="space-y-4">
          {termsSections.map((section, i) => (
            <li key={i}>
              <h4 className="font-display text-accent text-sm mb-2 tracking-wider">
                {i + 1}. {section.title.toUpperCase()}
              </h4>
              <ul className="space-y-1.5 text-neutral-300 list-disc pl-5">
                {section.items.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </div>
      <div
        className="pointer-events-none absolute left-0 right-0 bottom-[37px] h-12 bg-gradient-to-b from-transparent to-ink-soft transition-opacity"
        style={{ opacity: readAll ? 0 : 1 }}
        aria-hidden="true"
      />
      <div className="h-[3px] bg-[#222]" aria-hidden="true">
        <div className="h-[3px] bg-accent" style={{ width: `${progress * 100}%` }} />
      </div>
      <div className="flex justify-between px-3 py-2 border-t border-ink-line font-mono text-[10px] tracking-[0.12em] text-neutral-500">
        <span className={readAll ? 'text-success-green' : ''}>{readAll ? readLabel : scrollLabel}</span>
        <span>{termsSections.length}</span>
      </div>
    </div>
  );
}

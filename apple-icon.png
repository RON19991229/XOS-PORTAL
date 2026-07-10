'use client';

import { useEffect } from 'react';
import { termsIntro, termsSections } from '@/lib/terms';

interface TermsModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * TermsModal — Modal popup that displays the full T&C in a scrollable container.
 * Used on the Reminders page (returning customers) so they can review the
 * gym rules without leaving the check-in flow.
 *
 * Re-uses the same termsIntro / termsSections data shown during initial registration.
 *
 * UX:
 *   - ESC key or backdrop click → close
 *   - Body scroll locked while open
 *   - Yellow header bar with × close button
 *   - Bottom "CLOSE" button as alternative
 */
export default function TermsModal({ open, onClose }: TermsModalProps) {
  // ESC key to close + lock body scroll
  useEffect(() => {
    if (!open) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center px-4 py-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tc-modal-title"
    >
      <div
        className="bg-ink-soft border-2 border-accent w-full max-w-md max-h-full flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-accent text-ink px-4 py-3 flex justify-between items-center flex-shrink-0">
          <h3 id="tc-modal-title" className="font-display text-sm tracking-widest">
            TERMS & CONDITIONS
          </h3>
          <button
            onClick={onClose}
            aria-label="Close terms"
            className="text-ink text-2xl leading-none px-2 hover:opacity-70"
          >
            ✕
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-5 text-sm leading-relaxed text-neutral-300">
          <p className="font-display text-xs tracking-widest text-neutral-400 mb-2">
            INTRODUCTION
          </p>
          <p className="mb-4 whitespace-pre-line">
            {termsIntro}
          </p>

          <ol className="space-y-4">
            {termsSections.map((section, i) => (
              <li key={i}>
                <h4 className="font-display text-accent text-sm mb-2 tracking-wider">
                  {i + 1}. {section.title.toUpperCase()}
                </h4>
                <ul className="space-y-1.5 list-disc pl-5">
                  {section.items.map((item, j) => (
                    <li key={j}>{item}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>

          <p className="text-xs text-neutral-500 mt-6 font-mono">
            By proceeding to check-in, you confirm your continued agreement.
          </p>
        </div>

        {/* Footer */}
        <div className="border-t border-ink-line p-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full bg-accent text-ink py-3 font-display text-xs tracking-widest"
          >
            CLOSE & CONTINUE
          </button>
        </div>
      </div>
    </div>
  );
}

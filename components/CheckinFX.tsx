'use client';

/**
 * CheckinFX — shared UI bits for the v2.13 check-in premium redesign.
 *
 * Exports:
 *   CheckinBrand — report-style logo (tile + wordmark). The wordmark PNG is
 *                  black-on-transparent (made for the warm-white /report
 *                  pages), so on the dark check-in pages we invert it to
 *                  white via CSS filter — zero new assets needed.
 *   StepRail     — 3-segment progress bar (ID → RULES → TRAIN), no labels
 *                  since v2.24.0.
 *   Atmo         — single restrained background gradient (subtle yellow
 *                  glow at top). Parent must be position:relative.
 *   XdReveal     — scroll-to-reveal wrapper (IntersectionObserver, falls
 *                  back to always-visible on very old WebKit).
 */

import Image from 'next/image';
import { ReactNode, useEffect, useRef, useState } from 'react';

export function CheckinBrand() {
  return (
    <div className="xd-brand">
      <Image
        src="/report-logo-tile.png"
        alt="X FITNESS"
        width={34}
        height={34}
        priority
        className="xd-brand-tile rounded-[9px]"
      />
      <Image
        src="/report-wordmark.png"
        alt=""
        width={482}
        height={54}
        priority
        className="xd-brand-mark"
      />
    </div>
  );
}

export function Atmo() {
  return <div className="xd-atmo" aria-hidden="true" />;
}

interface StepRailProps {
  /** Current step: 1 = ID, 2 = RULES, 3 = TRAIN */
  step: 1 | 2 | 3;
  /** Also fill the segment of the current step (signals "in progress") */
  fillNext?: boolean;
  /** Extra classes (e.g. xd-rise xd-d2 for entrance stagger) */
  className?: string;
}

// v2.24.0: label-less 3-segment bar (Ron: less text on every page).
export function StepRail({ step, fillNext = false, className = '' }: StepRailProps) {
  const filled = step - 1 + (fillNext ? 1 : 0);
  return (
    <div className={`xd-rail ${className}`} aria-hidden="true">
      {[1, 2, 3].map((i) => (
        <span key={i} className={`xd-rseg ${i <= filled ? 'fill' : ''}`} />
      ))}
    </div>
  );
}

export function XdReveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setInView(true);
            io.disconnect();
          }
        });
      },
      { threshold: 0.1 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={`xd-reveal ${inView ? 'in' : ''} ${className}`}>
      {children}
    </div>
  );
}

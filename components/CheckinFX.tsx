'use client';

/**
 * CheckinFX — shared UI bits for the v2.13 check-in premium redesign.
 *
 * Exports:
 *   CheckinBrand — report-style logo (tile + wordmark). The wordmark PNG is
 *                  black-on-transparent (made for the warm-white /report
 *                  pages), so on the dark check-in pages we invert it to
 *                  white via CSS filter — zero new assets needed.
 *   StepRail     — 01 ID → 02 RULES → 03 TRAIN progress rail. Labels are
 *                  intentionally English-only (stylistic mono labels, same
 *                  treatment as hardcoded design labels elsewhere).
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
  /** Also animate-fill the line after the current step (signals "in progress") */
  fillNext?: boolean;
  /** Extra classes (e.g. xd-rise xd-d2 for entrance stagger) */
  className?: string;
}

export function StepRail({ step, fillNext = false, className = '' }: StepRailProps) {
  const steps = [
    { n: '01', label: 'ID' },
    { n: '02', label: 'RULES' },
    { n: '03', label: 'TRAIN' },
  ];

  return (
    <div className={`xd-rail ${className}`} aria-hidden="true">
      {steps.map((s, i) => {
        const idx = i + 1;
        const state = idx < step ? 'done' : idx === step ? 'on' : '';
        return (
          <span key={s.n} className="contents">
            <span className={`xd-rl ${state}`}>
              <b>{idx < step ? '✓' : s.n}</b> {s.label}
            </span>
            {i < steps.length - 1 && (
              // the connecting line fills (animated) once the step to its
              // left is completed, or while it is active-and-progressing
              // (fillNext)
              <span
                className={`xd-rline ${idx < step || (fillNext && idx === step) ? 'fill' : ''}`}
              />
            )}
          </span>
        );
      })}
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

'use client';

// v2.23.0 — global tap feedback for /checkin/* (Ron: "every button should feel
// alive"). One pointerdown listener adds a ripple + a 10ms haptic tick to any
// tappable element listed below. Visuals live in globals.css under `.ck-fx`
// so dashboards / login (which reuse .btn-primary) are unaffected.

import { useEffect } from 'react';

const TAPPABLE =
  '.btn-primary, .btn-secondary, .btn-checkin-cta, .xd-natcard, .reg-chip, .reg-agree, .ck-press';

export default function CheckinFxLayer() {
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const onDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      const el = target?.closest?.(TAPPABLE) as HTMLElement | null;
      if (!el || (el as HTMLButtonElement).disabled) return;

      try {
        navigator.vibrate?.(10);
      } catch {
        /* unsupported (iOS) — ignore */
      }
      if (reduce) return;

      const r = el.getBoundingClientRect();
      const d = Math.max(r.width, r.height);
      const s = document.createElement('span');
      s.className = 'ck-ripple';
      s.style.width = s.style.height = `${d}px`;
      s.style.left = `${e.clientX - r.left - d / 2}px`;
      s.style.top = `${e.clientY - r.top - d / 2}px`;
      el.appendChild(s);
      window.setTimeout(() => s.remove(), 600);
    };

    document.addEventListener('pointerdown', onDown, { passive: true });
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);

  return null;
}

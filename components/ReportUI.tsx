'use client';

// ===========================================================================
// Shared UI pieces for the customer-facing /report pages (warm-white theme,
// v2.12). Used ONLY by app/report/* — nothing here touches checkin or the
// dashboards.
// ===========================================================================

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';

// v2.17 — hero display fonts, self-hosted (loaded with /report/* only):
// Archivo 800 (EN/BM big line, same family as the brand's Archivo Black) +
// Noto Sans SC 900 (中文 big line). Fontsource splits Noto Sans SC into
// unicode-range subsets, so only the glyph ranges on the page get downloaded.
import '@fontsource/archivo/800.css';
import '@fontsource/noto-sans-sc/900.css';

// ---------------------------------------------------------------------------
// Light brand mark — Ron's real logos (v2.12.1):
//   report-logo-tile.png  = full XF logo on black, shown in a rounded tile
//   report-wordmark.png   = black "X FITNESS" wordmark on transparent bg
// (The main logo.png has a WHITE wordmark — invisible on the warm white bg.)
// ---------------------------------------------------------------------------
export function ReportBrand() {
  return (
    <div className="flex items-center gap-2.5">
      <Image
        src="/report-logo-tile.png"
        alt="X FITNESS"
        width={34}
        height={34}
        priority
        className="rounded-[9px] object-cover"
        style={{ boxShadow: '0 2px 6px rgba(0,0,0,.25)' }}
      />
      <Image
        src="/report-wordmark.png"
        alt=""
        width={482}
        height={54}
        priority
        style={{ height: '13px', width: 'auto' }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// The shield-heart mark (same drawing as v2.11, recolored for light bg).
// ---------------------------------------------------------------------------
export function ShieldHeart({ size = 84 }: { size?: number }) {
  // v2.17 — flat outline shield (ink stroke) + solid coral heart with a
  // gentle heartbeat. v2.17.1 — soft breathing coral halo behind it.
  return (
    <span className="rl-shield2wrap">
      <span className="rl-shield2-halo" />
      <svg
        className="rl-shield2"
        width={size}
        height={size}
        viewBox="0 0 86 86"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M43 8 L71 18 V41 C71 59 59 71.5 43 77 C27 71.5 15 59 15 41 V18 Z"
          stroke="#292420"
          strokeWidth="4.5"
          strokeLinejoin="round"
          fill="none"
        />
        <path
          className="rl-heartbeat"
          d="M43 34.5 c3-6 12-5.5 12 1.4 c0 5.2-7.2 10.4-12 14 c-4.8-3.6-12-8.8-12-14 c0-6.9 9-7.4 12-1.4Z"
          fill="#E8694A"
        />
      </svg>
    </span>
  );
}

// ---------------------------------------------------------------------------
// WhatsApp
// ---------------------------------------------------------------------------
export function WaIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
      <path d="M17.5 14.4c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.5 0 1.47 1.07 2.89 1.22 3.09.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2-1.42.25-.7.25-1.29.18-1.42-.08-.12-.28-.2-.58-.35zM12.03 21.8h-.01a9.87 9.87 0 01-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 01-1.51-5.26c0-5.45 4.44-9.88 9.9-9.88a9.83 9.83 0 016.99 2.9 9.82 9.82 0 012.89 7c0 5.45-4.44 9.87-9.89 9.87zm8.41-18.29A11.8 11.8 0 0012.03 0C5.46 0 .1 5.35.1 11.92c0 2.1.55 4.15 1.6 5.95L0 24l6.28-1.65a11.9 11.9 0 005.74 1.46h.01c6.57 0 11.92-5.35 11.92-11.92 0-3.18-1.24-6.17-3.5-8.42z" />
    </svg>
  );
}

// One-tap WhatsApp button (anchor). `prefill` is plain text — encoded here.
export function WaButton({
  href,
  prefill,
  children,
  size = 'md',
}: {
  href: string;
  prefill?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'full';
}) {
  const url = prefill ? `${href}?text=${encodeURIComponent(prefill)}` : href;
  const cls =
    size === 'sm' ? 'rl-wa-btn rl-wa-btn-sm' : size === 'full' ? 'rl-wa-btn rl-wa-btn-full' : 'rl-wa-btn';
  return (
    <a className={cls} href={url} target="_blank" rel="noopener noreferrer">
      <WaIcon size={size === 'sm' ? 16 : 17} />
      {children}
    </a>
  );
}

// Horizontal "prefer to talk?" card with a small CHAT button on the right.
export function WaCard({
  title,
  sub,
  cta,
  href,
}: {
  title: string;
  sub: string;
  cta: string;
  href: string;
}) {
  return (
    <div className="rl-wa-card">
      <div className="rl-wa-ic">
        <WaIcon size={24} />
      </div>
      <div className="min-w-0">
        <h4 className="m-0 text-[13px] font-bold">{title}</h4>
        <p className="m-0 mt-0.5 text-[11px] leading-relaxed" style={{ color: 'var(--rl-muted)' }}>
          {sub}
        </p>
      </div>
      <WaButton href={href} size="sm">
        {cta}
      </WaButton>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scroll-reveal wrapper. Fades content up when it enters the viewport.
// Falls back to instantly-visible when IntersectionObserver is missing
// (very old WebKit) — content must never be hidden forever.
// ---------------------------------------------------------------------------
export function Reveal({ children, className = '' }: { children: React.ReactNode; className?: string }) {
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
    <div ref={ref} className={`rl-reveal ${inView ? 'in' : ''} ${className}`}>
      {children}
    </div>
  );
}

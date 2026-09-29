'use client';

/**
 * v2.22.0 — dashboard privacy mode (shared by every /admin and /staff page).
 *
 * Ron: customers and competitors standing at the counter must not be able to
 * read names, IC, phone — or how many people checked in today (= sales).
 *
 *   - ON by default every time the dashboard is opened (not persisted).
 *   - Staff can turn it off; it switches itself back ON after 2 minutes
 *     with no mouse / keyboard / touch activity.
 *   - Text marked `className="sens"` is blurred via `.privacy-on .sens` in
 *     globals.css (text-shadow blur — no per-cell GPU filter layers).
 *   - Business numbers use <PrivateNum>, which replaces the value with •••
 *     so nothing can be read through the blur.
 *   - The LAST CHECK-IN card and the new-check-in popup stay readable.
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const IDLE_MS = 2 * 60 * 1000;

interface PrivacyCtx {
  privacy: boolean;
  togglePrivacy: () => void;
}

const Ctx = createContext<PrivacyCtx>({ privacy: true, togglePrivacy: () => {} });

export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  const [privacy, setPrivacy] = useState(true);
  const lastActivity = useRef(0);

  useEffect(() => {
    lastActivity.current = Date.now();
    const bump = () => {
      lastActivity.current = Date.now();
    };
    const events = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const timer = setInterval(() => {
      if (Date.now() - lastActivity.current > IDLE_MS) setPrivacy(true);
    }, 5000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      clearInterval(timer);
    };
  }, []);

  const togglePrivacy = useCallback(() => {
    lastActivity.current = Date.now();
    setPrivacy((p) => !p);
  }, []);

  return <Ctx.Provider value={{ privacy, togglePrivacy }}>{children}</Ctx.Provider>;
}

export function usePrivacy(): PrivacyCtx {
  return useContext(Ctx);
}

/** A business number (counts, totals). Shows ••• while privacy mode is on. */
export function PrivateNum({ value, className = '' }: { value: React.ReactNode; className?: string }) {
  const { privacy } = usePrivacy();
  if (privacy) {
    return (
      <span className={`${className} privacy-dots`} aria-label="hidden">
        •••
      </span>
    );
  }
  return <span className={className}>{value}</span>;
}

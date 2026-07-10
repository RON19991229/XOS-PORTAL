/**
 * safe-storage — crash-proof wrappers around sessionStorage / localStorage.
 *
 * WHY THIS EXISTS (the iPhone "server error" bug, fixed v2.7.3):
 * --------------------------------------------------------------
 * Our customers reach /checkin by scanning a QR code. A large share of them
 * open that link in:
 *   - Private / Incognito browsing
 *   - In-app browsers (WeChat, WhatsApp, Instagram, etc.)
 *   - Safari/Chrome on iOS with "Prevent Cross-Site Tracking" on
 *
 * On iOS, EVERY browser (Chrome, Edge, Firefox included) is forced to use
 * Apple's WebKit engine. In the situations above, WebKit will THROW a
 * SecurityError / QuotaExceededError the moment you touch
 * sessionStorage.getItem/setItem — it doesn't just return null.
 *
 * The old code called sessionStorage / localStorage ~25 times with no
 * try/catch anywhere, so a single throw crashed the whole React tree and the
 * customer saw a full-page "Application error" (what they described as a
 * "server error"). Desktop Chrome never hit this because it uses V8/Blink and
 * happily allows storage.
 *
 * THE FIX:
 *   - Every read/write/remove/clear is wrapped in try/catch and degrades to a
 *     no-op (reads return null) instead of throwing.
 *   - When the real Storage is unavailable, we transparently fall back to an
 *     in-memory Map. This keeps the multi-step checkin flow working WITHIN a
 *     single page session (language → nationality → IC → register → reminders
 *     → approved), because all those values are written and read during the
 *     same JS runtime. They just won't survive a full page reload — which is
 *     an acceptable trade for "the app never crashes".
 *
 * Use safeSession / safeLocal everywhere instead of the raw globals.
 */

// In-memory fallbacks. One per storage type. These live for the lifetime of
// the JS runtime (i.e. until a hard reload / new tab), which is exactly the
// span of one customer's checkin journey.
const memSession = new Map<string, string>();
const memLocal = new Map<string, string>();

type Kind = 'session' | 'local';

function backing(kind: Kind): Storage | null {
  if (typeof window === 'undefined') return null; // SSR
  try {
    return kind === 'session' ? window.sessionStorage : window.localStorage;
  } catch {
    // Accessing the property itself can throw in some locked-down WebViews.
    return null;
  }
}

function mem(kind: Kind): Map<string, string> {
  return kind === 'session' ? memSession : memLocal;
}

function makeStorage(kind: Kind) {
  return {
    getItem(key: string): string | null {
      const store = backing(kind);
      if (store) {
        try {
          const v = store.getItem(key);
          // If real storage has it, prefer that; otherwise fall through to mem
          // (covers the case where an earlier setItem silently went to mem).
          if (v !== null) return v;
        } catch {
          /* fall through to memory */
        }
      }
      const m = mem(kind);
      return m.has(key) ? m.get(key)! : null;
    },

    setItem(key: string, value: string): void {
      // Always mirror into memory so reads succeed even if the real write fails.
      mem(kind).set(key, value);
      const store = backing(kind);
      if (store) {
        try {
          store.setItem(key, value);
        } catch {
          /* memory already holds it — safe to ignore */
        }
      }
    },

    removeItem(key: string): void {
      mem(kind).delete(key);
      const store = backing(kind);
      if (store) {
        try {
          store.removeItem(key);
        } catch {
          /* ignore */
        }
      }
    },

    clear(): void {
      mem(kind).clear();
      const store = backing(kind);
      if (store) {
        try {
          store.clear();
        } catch {
          /* ignore */
        }
      }
    },
  };
}

export const safeSession = makeStorage('session');
export const safeLocal = makeStorage('local');

/**
 * Crash-proof JSON.parse. Returns `fallback` (default null) instead of
 * throwing on malformed input — important because storage values that came
 * back partially written, or got mangled by an in-app browser, would
 * otherwise crash the page on JSON.parse.
 */
export function safeJsonParse<T>(raw: string | null, fallback: T | null = null): T | null {
  if (raw === null || raw === undefined) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

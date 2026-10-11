// v2.23.0 — first-visit rules video (made in Remotion, project `xf-video`).
//
// Who must watch it (once, to the end, before CHECK IN): first visits only —
//   - new customers (flag set by /checkin/register), or
//   - customers with no approved visit yet (last_visit_at is null).
// Existing customers keep the static rule images (Ron, Oct 2026: no
// "everyone watches once after launch").
//
// Files live in public/rules/ with a version in the name and are served with
// an immutable cache header (vercel.json). One video per language — the
// captions are baked in.

import type { Lang } from './i18n';

export const RULES_VIDEO_VERSION = 'v4';

export const rulesVideoSrc = (lang: Lang) => `/rules/rules-${RULES_VIDEO_VERSION}-${lang}.mp4`;
export const rulesPosterSrc = (lang: Lang) => `/rules/rules-${RULES_VIDEO_VERSION}-${lang}-poster.webp`;

/** sessionStorage key: set by register (new customer → must watch). */
export const RULES_VIDEO_FLAG = 'xf-rules-video';
/** sessionStorage key: IC of the customer who already finished the video in this tab. */
export const RULES_WATCHED_KEY = 'xf-rules-watched';

export function mustWatchRules(lastVisitAt: string | null): boolean {
  return !lastVisitAt;
}

// ---------- prefetch ----------
// Download the whole file into memory as soon as we know the visitor will
// need it (register page), so playback is instant on the rules page. A
// module-level cache survives client-side navigation between /checkin pages.
// Falls back to normal streaming (src = URL) if the prefetch isn't done.

const cache = new Map<Lang, Promise<string | null>>();

export function prefetchRulesVideo(lang: Lang): Promise<string | null> {
  const hit = cache.get(lang);
  if (hit) return hit;
  const p = fetch(rulesVideoSrc(lang))
    .then((r) => (r.ok ? r.blob() : null))
    .then((b) => (b ? URL.createObjectURL(b) : null))
    .catch(() => null);
  cache.set(lang, p);
  return p;
}

/** The blob URL if the prefetch already finished, else null (stream instead). */
export async function readyRulesVideo(lang: Lang): Promise<string | null> {
  const p = cache.get(lang);
  if (!p) return null;
  return Promise.race([p, new Promise<null>((res) => setTimeout(() => res(null), 50))]);
}

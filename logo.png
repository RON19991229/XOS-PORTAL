'use client';

import { useEffect, useState } from 'react';

/**
 * ScrollHint — gives users a clear visual cue that there's more content
 * below the fold. Designed to be safe to drop into ANY checkin page —
 * if the page already fits in the viewport, this component renders
 * nothing and never auto-scrolls.
 *
 * Behavior:
 *   1) On mount, measure if the page actually overflows. If not (page is
 *      shorter than viewport, or only barely overflows by < 60px), do
 *      nothing — no auto-scroll, no hint.
 *
 *   2) If the page DOES overflow, after 800ms smoothly auto-scroll.
 *      Two strategies, picked at runtime:
 *
 *      a) TARGET-AWARE: If the page has a [data-scroll-target] element
 *         (e.g. the CTA), scroll until that element sits at ~65% down
 *         the viewport — so it's clearly visible without being flush
 *         with the bottom edge. This is what the Reminders page uses
 *         to make sure customers see the I ACKNOWLEDGE button on
 *         arrival (top complaint: "I didn't know there was a button").
 *
 *      b) FALLBACK: If no target is marked, scroll a flat 100px. This
 *         is the original v2.5 behaviour and preserves the "there's
 *         more below" hint on pages that don't have one canonical CTA.
 *
 *      Both strategies are cancelled if the user has already scrolled
 *      (we never fight the user).
 *
 *   3) Render a fixed-position fade-to-black gradient at the bottom of
 *      the viewport with a bouncing yellow arrow + "MORE BELOW" label.
 *      Hides itself once the user has scrolled to within 80px of the
 *      bottom OR has already scrolled past 200px (they clearly know
 *      to scroll now).
 *
 * Both behaviors respect `prefers-reduced-motion`: the auto-scroll is
 * skipped, and the bouncing arrow does not bounce (the hint still appears
 * but as a static element).
 *
 * NOTE: We re-measure overflow on resize and after a short delay because
 * many of our checkin pages have async-loaded content (e.g. visit stats,
 * guardian fields toggling on age). A page that initially fits may grow
 * after data hydrates.
 */

// If the page overflows the viewport by less than this many px, don't
// bother showing the hint — it's basically already in view.
const OVERFLOW_THRESHOLD_PX = 60;

// Where in the viewport we want the target's TOP edge to land after
// the auto-scroll. 0.65 = 65% down from the top of the viewport, which
// puts the CTA comfortably in the lower portion with rule content
// still visible above it.
const TARGET_VIEWPORT_RATIO = 0.65;

// Don't scroll less than this — if the math says we'd only scroll a
// tiny amount, the user might not notice. Below this we just don't
// auto-scroll at all (the target is already basically in view).
const MIN_AUTO_SCROLL_PX = 60;

export default function ScrollHint() {
  const [showHint, setShowHint] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);

  useEffect(() => {
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let autoScrollTimer: ReturnType<typeof setTimeout> | null = null;
    let userHasScrolled = false;
    let hasAutoScrolled = false;

    const measureOverflow = (): boolean => {
      const total = document.documentElement.scrollHeight;
      const viewport = window.innerHeight;
      return total - viewport > OVERFLOW_THRESHOLD_PX;
    };

    /**
     * Compute how many pixels to auto-scroll. Returns 0 if no scroll
     * is needed (target already visible) or if not enough scroll-room
     * to make a noticeable difference.
     */
    const computeAutoScrollDelta = (): number => {
      const target = document.querySelector<HTMLElement>('[data-scroll-target]');
      const viewport = window.innerHeight;
      const maxScroll = document.documentElement.scrollHeight - viewport;

      if (target) {
        const rect = target.getBoundingClientRect();
        // Distance to scroll = current top of target − desired top of target
        const desiredTop = viewport * TARGET_VIEWPORT_RATIO;
        const delta = Math.round(rect.top - desiredTop);

        // If target is already at or above the desired position, don't
        // scroll up (negative delta) and don't bother with tiny scrolls.
        if (delta < MIN_AUTO_SCROLL_PX) return 0;

        // Don't scroll past the max scroll position.
        return Math.min(delta, maxScroll - window.scrollY);
      }

      // FALLBACK — no target marked, use the original 100px hint scroll
      return Math.min(100, maxScroll - window.scrollY);
    };

    const onUserScroll = () => {
      // Track user scroll so we can cancel the pending auto-scroll.
      // Threshold of 5px filters out passive iOS rubber-banding.
      if (window.scrollY > 5) {
        userHasScrolled = true;
        if (autoScrollTimer) {
          clearTimeout(autoScrollTimer);
          autoScrollTimer = null;
        }
      }
    };

    const onScrollCheckBottom = () => {
      // Re-check if the page has grown since mount (async content)
      const overflowsNow = measureOverflow();
      setHasOverflow(overflowsNow);

      if (!overflowsNow) {
        setShowHint(false);
        return;
      }

      const scrolled = window.scrollY + window.innerHeight;
      const total = document.documentElement.scrollHeight;
      // Hide the hint once we're within 80px of the bottom OR the user
      // has scrolled more than 200px (they clearly know to scroll now).
      if (total - scrolled < 80 || window.scrollY > 200) {
        setShowHint(false);
      } else {
        setShowHint(true);
      }
    };

    // Initial measurement after layout settles. Use rAF + tiny delay so
    // images / fonts / async content have a chance to land first.
    const initialMeasureTimer = setTimeout(() => {
      requestAnimationFrame(() => {
        const overflows = measureOverflow();
        setHasOverflow(overflows);
        setShowHint(overflows);

        if (overflows && !reduceMotion && !hasAutoScrolled) {
          autoScrollTimer = setTimeout(() => {
            if (!userHasScrolled) {
              const delta = computeAutoScrollDelta();
              if (delta > 0) {
                window.scrollBy({ top: delta, left: 0, behavior: 'smooth' });
              }
              hasAutoScrolled = true;
            }
          }, 800);
        }
      });
    }, 80);

    window.addEventListener('scroll', onUserScroll, { passive: true });
    window.addEventListener('scroll', onScrollCheckBottom, { passive: true });
    window.addEventListener('resize', onScrollCheckBottom);

    return () => {
      clearTimeout(initialMeasureTimer);
      if (autoScrollTimer) clearTimeout(autoScrollTimer);
      window.removeEventListener('scroll', onUserScroll);
      window.removeEventListener('scroll', onScrollCheckBottom);
      window.removeEventListener('resize', onScrollCheckBottom);
    };
  }, []);

  if (!hasOverflow || !showHint) return null;

  return (
    <div
      className="scroll-hint-overlay"
      aria-hidden="true"
    >
      <div className="scroll-hint-arrow">▼</div>
      <div className="scroll-hint-label">MORE BELOW</div>
    </div>
  );
}

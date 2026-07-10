/**
 * Plays a short, pleasant two-tone "ding" using the Web Audio API.
 *
 * - Zero asset files (no MP3/WAV to download)
 * - Works in all evergreen browsers
 * - Silently no-ops if audio context can't be created (e.g. SSR, blocked tab)
 *
 * Browsers require a user gesture before audio can play. The first time
 * this is called, it may be silent if the page hasn't been interacted with.
 * That's fine — the staff/admin will click *something* in the dashboard
 * before the first check-in arrives, so subsequent chimes work.
 */

let cachedCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (cachedCtx) return cachedCtx;
  try {
    const Ctx = (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    if (!Ctx) return null;
    cachedCtx = new Ctx();
    return cachedCtx;
  } catch {
    return null;
  }
}

export function playChime(variant: 'ok' | 'denied' = 'ok') {
  const ctx = getCtx();
  if (!ctx) return;

  // Some browsers leave the context suspended until a user gesture.
  // Try to resume; if it fails, just bail.
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }

  const now = ctx.currentTime;
  // Two notes: OK = bright pleasant rising; DENIED = lower minor tone
  const notes = variant === 'ok'
    ? [{ freq: 880, start: 0,    dur: 0.18 },  // A5
       { freq: 1320, start: 0.10, dur: 0.22 }] // E6 — perfect fifth
    : [{ freq: 440, start: 0,    dur: 0.15 },  // A4
       { freq: 330, start: 0.12, dur: 0.25 }]; // E4 — descending

  for (const note of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.value = note.freq;

    // Quick attack then exponential decay = pleasant "ding"
    const startAt = now + note.start;
    const endAt = startAt + note.dur;
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.18, startAt + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, endAt);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startAt);
    osc.stop(endAt + 0.02);
  }
}

// v2.20.0 — check-in sounds for the staff/admin dashboard.
//
// - Zero asset files: tones are synthesised with the Web Audio API.
// - Browsers keep audio LOCKED until the page gets a user gesture. The
//   state is observable (getAudioState / subscribeAudio) so the nav can
//   show a red "SOUND OFF — CLICK TO ENABLE" button instead of failing
//   silently, which is what happened before v2.20.0.
// - Mute preference persists per device (localStorage), so a shared
//   counter PC keeps its setting across reloads.
//
// Variants:
//   ok     — bright rising two-note ding (normal check-in)
//   warn   — two short mid pings (customer with warnings)
//   denied — low descending tone (under-12 refused)
//   alarm  — loud triple beep, repeated by the popup every 5 s while a
//            banned-customer alert is unacknowledged

export type ChimeVariant = 'ok' | 'warn' | 'denied' | 'alarm';
export type AudioState = 'ready' | 'blocked' | 'muted' | 'unsupported';

const MUTE_KEY = 'xf-sound-muted';

let cachedCtx: AudioContext | null = null;
let muted: boolean | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

function isMuted(): boolean {
  if (muted === null) {
    try {
      muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      muted = false;
    }
  }
  return muted;
}

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (cachedCtx) return cachedCtx;
  try {
    const Ctx = (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    if (!Ctx) return null;
    cachedCtx = new Ctx();
    cachedCtx.onstatechange = notify;
    return cachedCtx;
  } catch {
    return null;
  }
}

export function getAudioState(): AudioState {
  if (typeof window === 'undefined') return 'unsupported';
  if (isMuted()) return 'muted';
  const ctx = getCtx();
  if (!ctx) return 'unsupported';
  return ctx.state === 'running' ? 'ready' : 'blocked';
}

export function subscribeAudio(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Call from a user gesture (click / keydown) to unlock audio. */
export function enableAudio(): void {
  const ctx = getCtx();
  if (ctx && ctx.state !== 'running') {
    ctx.resume().then(notify).catch(() => {});
  }
}

export function setMuted(value: boolean): void {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? '1' : '0');
  } catch {
    /* storage unavailable — keep in memory only */
  }
  if (!value) enableAudio();
  notify();
}

type Note = { freq: number; start: number; dur: number; type?: OscillatorType; peak?: number };

const PATTERNS: Record<ChimeVariant, Note[]> = {
  ok: [
    { freq: 880, start: 0, dur: 0.18 },      // A5
    { freq: 1320, start: 0.1, dur: 0.22 },   // E6 — perfect fifth
  ],
  warn: [
    { freq: 988, start: 0, dur: 0.12, type: 'triangle', peak: 0.22 },
    { freq: 988, start: 0.18, dur: 0.12, type: 'triangle', peak: 0.22 },
  ],
  denied: [
    { freq: 440, start: 0, dur: 0.15 },      // A4
    { freq: 330, start: 0.12, dur: 0.25 },   // E4 — descending
  ],
  alarm: [
    { freq: 1046, start: 0, dur: 0.16, type: 'square', peak: 0.12 },
    { freq: 784, start: 0.2, dur: 0.16, type: 'square', peak: 0.12 },
    { freq: 1046, start: 0.4, dur: 0.16, type: 'square', peak: 0.12 },
    { freq: 784, start: 0.6, dur: 0.24, type: 'square', peak: 0.12 },
  ],
};

export function playChime(variant: ChimeVariant = 'ok') {
  if (isMuted()) return;
  const ctx = getCtx();
  if (!ctx) return;

  // Still locked (no user gesture yet): try to resume, then bail. The nav's
  // sound button tells staff to click once.
  if (ctx.state === 'suspended') {
    ctx.resume().then(notify).catch(() => {});
  }

  const now = ctx.currentTime;
  for (const note of PATTERNS[variant]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = note.type ?? 'sine';
    osc.frequency.value = note.freq;

    // Quick attack then exponential decay
    const startAt = now + note.start;
    const endAt = startAt + note.dur;
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(note.peak ?? 0.18, startAt + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, endAt);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startAt);
    osc.stop(endAt + 0.02);
  }
}

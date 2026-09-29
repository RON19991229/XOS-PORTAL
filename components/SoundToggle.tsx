'use client';

// v2.20.0 — sound status button in the dashboard top bar (DashboardShell since v2.22.0). Browsers block audio until
// the page is clicked once; before v2.20.0 the check-in chime just stayed
// silent with no hint. Now staff see a red "SOUND OFF — CLICK TO ENABLE".
// Clicking also asks (once) for Windows notification permission, so a
// banned-customer alert still reaches them when the browser is minimised.

import { useEffect, useState } from 'react';
import { AudioState, enableAudio, getAudioState, setMuted, subscribeAudio } from '@/lib/chime';

export default function SoundToggle() {
  // 'unsupported' on the server render; the real state is read on mount.
  const [state, setState] = useState<AudioState>('unsupported');

  useEffect(() => {
    const update = () => setState(getAudioState());
    update();
    return subscribeAudio(update);
  }, []);

  if (state === 'unsupported') return null;

  const onClick = () => {
    if (state === 'ready') {
      setMuted(true);
    } else {
      setMuted(false);
      enableAudio();
    }
    try {
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }
    } catch {
      /* Notifications unavailable — popup + sound still work */
    }
  };

  // v2.22.0: restyled for the white dashboard top bar.
  const look =
    state === 'ready'
      ? { cls: 'bg-white border-line-strong text-ink hover:border-ink', label: 'SOUND ON', title: 'Check-in sounds on — click to mute' }
      : state === 'muted'
      ? { cls: 'bg-white border-line-strong text-muted hover:border-ink', label: 'MUTED', title: 'Check-in sounds muted — click to turn on' }
      : { cls: 'border-danger bg-danger text-white', label: 'SOUND OFF — CLICK', title: 'Browser blocked sound — click to enable check-in alerts' };

  return (
    <button
      type="button"
      onClick={onClick}
      title={look.title}
      aria-label={look.title}
      className={`h-10 flex items-center gap-1.5 font-mono text-[10px] font-bold tracking-widest px-3 border whitespace-nowrap transition-colors ${look.cls}`}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M11 5L6 9H2v6h4l5 4V5z" />
        {state === 'ready' ? <path d="M15.5 8.5a5 5 0 0 1 0 7" /> : <path d="M22 9l-6 6M16 9l6 6" />}
      </svg>
      <span className="hidden sm:inline">{look.label}</span>
    </button>
  );
}

'use client';

/**
 * v2.23.0 — full-screen first-visit rules video (see lib/rules-video.ts).
 *
 * - Starts on the customer's PLAY tap (so sound is allowed), plays inline.
 * - No controls, no seeking ahead; CHECK IN only appears after `ended`.
 * - Never blocks entry: if the video errors, or can't start / stalls for
 *   8 s after PLAY, `onFallback` hands back to the static rules page.
 */

import { useEffect, useRef, useState } from 'react';
import { Lang, t } from '@/lib/i18n';
import { readyRulesVideo, rulesPosterSrc, rulesVideoSrc } from '@/lib/rules-video';

type Phase = 'idle' | 'playing' | 'paused' | 'ended';

const STALL_MS = 8000;

export default function RulesVideo({
  lang,
  loading,
  errorMsg,
  onCheckIn,
  onWatched,
  onFallback,
}: {
  lang: Lang;
  loading: boolean;
  errorMsg: string;
  onCheckIn: () => void;
  onWatched: () => void;
  onFallback: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const maxT = useRef(0);
  const stall = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [src, setSrc] = useState(rulesVideoSrc(lang));
  const [phase, setPhase] = useState<Phase>('idle');
  const [buffering, setBuffering] = useState(false);
  const heavy = lang === 'zh' ? 'font-sans font-black' : 'font-display';

  // Use the in-memory copy if register already prefetched it.
  useEffect(() => {
    let alive = true;
    readyRulesVideo(lang).then((blobUrl) => {
      if (alive && blobUrl) setSrc(blobUrl);
    });
    return () => {
      alive = false;
    };
  }, [lang]);

  // Lock page scroll behind the overlay.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
      if (stall.current) clearTimeout(stall.current);
    };
  }, []);

  const armStall = () => {
    if (stall.current) clearTimeout(stall.current);
    stall.current = setTimeout(onFallback, STALL_MS);
  };
  const clearStall = () => {
    if (stall.current) clearTimeout(stall.current);
    stall.current = null;
  };

  const play = () => {
    const v = videoRef.current;
    if (!v) return;
    if (phase === 'ended') {
      maxT.current = 0;
      v.currentTime = 0;
    }
    setBuffering(v.readyState < 3);
    armStall();
    v.play().catch(() => {
      clearStall();
      onFallback();
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-ink flex flex-col" role="dialog" aria-modal="true">
      <div className="relative flex-1 min-h-0">
        <video
          ref={videoRef}
          src={src}
          poster={rulesPosterSrc(lang)}
          playsInline
          preload="auto"
          disablePictureInPicture
          controls={false}
          className="absolute inset-0 w-full h-full object-contain"
          onPlay={() => setPhase('playing')}
          onPlaying={() => {
            setBuffering(false);
            clearStall();
          }}
          onWaiting={() => {
            setBuffering(true);
            armStall();
          }}
          onPause={() => {
            const v = videoRef.current;
            if (v && !v.ended) setPhase('paused');
            clearStall();
          }}
          onTimeUpdate={() => {
            const v = videoRef.current;
            if (v) maxT.current = Math.max(maxT.current, v.currentTime);
          }}
          onSeeking={() => {
            const v = videoRef.current;
            if (v && v.currentTime > maxT.current + 0.75) v.currentTime = maxT.current;
          }}
          onEnded={() => {
            clearStall();
            setBuffering(false);
            setPhase('ended');
            onWatched();
          }}
          onError={() => {
            clearStall();
            onFallback();
          }}
        />
        {buffering && phase !== 'ended' && (
          <div className="absolute inset-0 grid place-items-center pointer-events-none">
            <span className="flex gap-1.5">
              <span className="loading-dot inline-block w-2.5 h-2.5 bg-accent rounded-full" />
              <span className="loading-dot inline-block w-2.5 h-2.5 bg-accent rounded-full" />
              <span className="loading-dot inline-block w-2.5 h-2.5 bg-accent rounded-full" />
            </span>
          </div>
        )}
      </div>

      <div className="flex-none px-5 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] max-w-md mx-auto w-full min-h-[118px] flex flex-col justify-center">
        {phase === 'idle' && (
          <>
            <button type="button" onClick={play} className={`btn-primary ck-shine ${heavy}`}>
              {t(lang, 'rvPlay')}
            </button>
            <p className="font-mono text-[10px] tracking-[0.25em] text-neutral-400 text-center mt-2.5">
              {t(lang, 'rvHint')}
            </p>
          </>
        )}

        {phase === 'playing' && (
          <p className="font-mono text-[10px] tracking-[0.25em] text-neutral-500 text-center">
            🔒 {t(lang, 'rvWatching')}
          </p>
        )}

        {phase === 'paused' && (
          <button type="button" onClick={play} className={`btn-primary ${heavy}`}>
            {t(lang, 'rvResume')}
          </button>
        )}

        {phase === 'ended' && (
          <>
            <button
              type="button"
              onClick={onCheckIn}
              disabled={loading}
              className={`btn-checkin-cta ${lang === 'zh' ? 'btn-checkin-cta-zh' : ''}`}
            >
              {loading ? (
                <span className="flex gap-1.5 justify-center">
                  <span className="loading-dot inline-block w-2 h-2 bg-ink rounded-full" />
                  <span className="loading-dot inline-block w-2 h-2 bg-ink rounded-full" />
                  <span className="loading-dot inline-block w-2 h-2 bg-ink rounded-full" />
                </span>
              ) : (
                <>{t(lang, 'acknowledge')} →</>
              )}
            </button>
            {errorMsg && (
              <div className="bg-danger text-bone px-4 py-3 mt-3 font-display text-sm tracking-wider animate-shake">
                {errorMsg}
              </div>
            )}
            <button
              type="button"
              onClick={play}
              disabled={loading}
              className="mt-3 text-center font-mono text-[10px] tracking-[0.25em] text-neutral-400 underline underline-offset-4"
            >
              ↺ {t(lang, 'rvReplay')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

'use client';

// v2.23.0 — one-shot confetti burst (birthday greeting, visit milestones).
// Pieces are generated after mount so server and client HTML match.
// Hidden entirely under prefers-reduced-motion (see .ck-confetti in globals.css).

import { useEffect, useState } from 'react';

const COLORS = ['#FFD60A', '#ff8c3c', '#ffffff', '#16c75b', '#ff7ac8'];

interface Piece {
  left: number;
  delay: number;
  duration: number;
  color: string;
  round: boolean;
}

export default function Confetti({ count = 60, delay = 0 }: { count?: number; delay?: number }) {
  const [pieces, setPieces] = useState<Piece[]>([]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setPieces(
        Array.from({ length: count }, (_, i) => ({
          left: Math.random() * 100,
          delay: Math.random() * 1.2,
          duration: 2.4 + Math.random() * 1.6,
          color: COLORS[i % COLORS.length],
          round: i % 3 === 0,
        }))
      );
    }, delay);
    const clear = window.setTimeout(() => setPieces([]), delay + 5500);
    return () => {
      window.clearTimeout(id);
      window.clearTimeout(clear);
    };
  }, [count, delay]);

  if (pieces.length === 0) return null;
  return (
    <div className="ck-confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <i
          key={i}
          style={{
            left: `${p.left}%`,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            borderRadius: p.round ? '50%' : '1px',
          }}
        />
      ))}
    </div>
  );
}

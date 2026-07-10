'use client';

/**
 * TaglineMarquee — vertical rotating marquee that cycles through
 * the same tagline in EN / 中文 / BM, every 3 seconds.
 *
 * v2 revision (2026-05-07):
 *   - Removed language tags (ENGLISH / 中文 / BAHASA MELAYU) — they were
 *     eating vertical space and the language is obvious from the text itself.
 *   - Removed yellow underline — same reason.
 *   - Font size now responsive: clamp(28px, 8.5vw, 38px). On a typical
 *     ~380px phone this resolves to ~32px, fitting "SELAMANYA PANTAS"
 *     comfortably without wrapping.
 *   - Each language gets a clean centered frame with nothing cropped.
 *
 * Font:
 *   - EN + BM use font-display (= Archivo Black, same as WELCOME heading)
 *   - ZH falls back to Inter 900 because Archivo Black has no CJK glyphs
 */
export default function TaglineMarquee() {
  return (
    <div className="relative overflow-hidden h-[170px] my-6">
      <div className="marquee-track">
        <MarqueeItem
          textNode={
            <>
              REGISTER ONCE.
              <br />
              <span className="text-accent">FAST CHECK-IN</span>
              <br />
              NEXT TIME.
            </>
          }
          isChinese={false}
        />
        <MarqueeItem
          textNode={
            <>
              只需一次注册
              <br />
              <span className="text-accent">下次快速 CHECK-IN</span>
            </>
          }
          isChinese={true}
        />
        <MarqueeItem
          textNode={
            <>
              SEKALI DAFTAR
              <br />
              <span className="text-accent">SELAMANYA PANTAS</span>
            </>
          }
          isChinese={false}
        />
        {/* Duplicate first item for seamless loop */}
        <MarqueeItem
          textNode={
            <>
              REGISTER ONCE.
              <br />
              <span className="text-accent">FAST CHECK-IN</span>
              <br />
              NEXT TIME.
            </>
          }
          isChinese={false}
        />
      </div>

      <style jsx>{`
        .marquee-track {
          animation: marquee-rotate 9s ease-in-out infinite;
        }
        @keyframes marquee-rotate {
          0%, 27%   { transform: translateY(0); }
          33%, 60%  { transform: translateY(-170px); }
          66%, 93%  { transform: translateY(-340px); }
          100%      { transform: translateY(-510px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .marquee-track { animation: none; }
        }
      `}</style>
    </div>
  );
}

function MarqueeItem({
  textNode,
  isChinese,
}: {
  textNode: React.ReactNode;
  isChinese: boolean;
}) {
  // Chinese must use Inter 900 (Archivo Black has no CJK chars)
  // EN + BM use font-display (= Archivo Black, matches WELCOME heading)
  const fontClass = isChinese
    ? 'font-sans font-black tracking-tight'
    : 'font-display tracking-tighter';

  return (
    <div className="h-[170px] flex items-center justify-center px-4 text-center">
      <div
        className={`${fontClass} text-bone leading-[0.95] w-full`}
        style={{ fontSize: 'clamp(28px, 8.5vw, 38px)' }}
      >
        {textNode}
      </div>
    </div>
  );
}

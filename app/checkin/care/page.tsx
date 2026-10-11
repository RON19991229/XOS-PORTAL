'use client';

/**
 * v2.23.0 — one-time "care" page, shown right after a first registration and
 * before the rules (register → care → reminders). Ron-approved mockup
 * `mockups/checkin-wow.html`.
 *
 *   - Women ("HEY GIRLS,"): matches the in-gym "Do you feel unsafe during
 *     workout?" poster — pink accent, WE'VE GOT YOUR BACK, three ways to speak
 *     up (front desk, private /report form, WhatsApp) + a thumbnail of the
 *     poster so they recognise its QR code in the gym, + confidentiality line.
 *   - Everyone else (men, or gender unknown): a short "need help? just ask
 *     the front desk" page.
 *
 * Gender comes from the read-back customer row (`customers.gender`):
 * Malaysians via the IC trigger, foreigners from the register form.
 * Links open in a new tab so the check-in itself is never lost.
 *
 * v2.24.0: shorter copy — no kicker, one-line body (confidentiality folded
 * in), no sub-lines under the three options, no separate promise box.
 */

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Lang, t } from '@/lib/i18n';
import { safeSession, safeJsonParse } from '@/lib/safe-storage';
import { Customer } from '@/lib/types';
import { WHATSAPP_URL } from '@/lib/report-config';
import CheckinHeader from '@/components/CheckinHeader';
import { StepRail } from '@/components/CheckinFX';

const PINK = '#ff7ac8';

export default function CarePage() {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>('en');
  const [customer, setCustomer] = useState<Customer | null>(null);

  useEffect(() => {
    const savedLang = safeSession.getItem('xf-lang') as Lang | null;
    if (savedLang) setLang(savedLang);
    const c = safeJsonParse<Customer>(safeSession.getItem('xf-customer'));
    if (!c) {
      router.replace('/checkin');
      return;
    }
    setCustomer(c);
  }, [router]);

  if (!customer) return null;

  const female = customer.gender === 'female';
  const heavy = lang === 'zh' ? 'font-sans font-black' : 'font-display';
  const next = () => router.push('/checkin/reminders');

  return (
    <main className="min-h-screen flex flex-col bg-ink relative overflow-hidden">
      <div className={`ck-amb ${female ? 'rose' : ''}`} aria-hidden="true">
        <div className="ck-orb ck-orb-1" />
        <div className="ck-orb ck-orb-2" />
      </div>

      <CheckinHeader className="xd-rise xd-d1 !bg-ink/40 backdrop-blur-sm" />
      <StepRail step={1} fillNext className="xd-rise xd-d2" />

      <section
        className={`flex-1 flex flex-col px-5 pb-8 max-w-md mx-auto w-full relative z-[2] ${female ? 'pt-6' : 'pt-14'}`}
      >
        <Shield color={female ? PINK : '#FFD60A'} />

        {female ? (
          <>
            <p className={`${heavy} text-center text-[26px] leading-none mt-5 xd-rise xd-d3`} style={{ color: PINK }}>
              {t(lang, 'careHeyGirls')}
            </p>
            <h1 className={`${heavy} text-center text-[34px] leading-[0.98] mt-2 xd-rise xd-d4`}>
              {t(lang, 'careTitleF')}
            </h1>
            <p className="text-center text-[15px] leading-relaxed text-neutral-300 mt-4 px-1 xd-rise xd-d4">
              {t(lang, 'careBodyF')}
            </p>

            <div className="grid gap-2.5 mt-6 xd-rise xd-d5">
              <div className="ck-opt">
                <span className="ck-opt-ic" aria-hidden="true">🙋‍♀️</span>
                <span className={`flex-1 ${heavy} text-sm`}>{t(lang, 'careFrontDesk')}</span>
              </div>

              <a className="ck-opt ck-press ck-press-dark" href="/report" target="_blank" rel="noopener">
                <span className="ck-opt-ic" aria-hidden="true">📝</span>
                <span className={`flex-1 ${heavy} text-sm`}>{t(lang, 'careReport')}</span>
                <span className="font-display text-neutral-500" aria-hidden="true">→</span>
              </a>

              <a className="ck-opt ck-press ck-press-dark" href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
                <span
                  className="w-[42px] h-[42px] flex-none grid place-items-center bg-[#25D366]/10 border border-[#25D366]/50"
                  aria-hidden="true"
                >
                  <WhatsAppIcon />
                </span>
                <span className={`flex-1 ${heavy} text-sm`}>{t(lang, 'careWhatsApp')}</span>
                <span className="font-display text-neutral-500" aria-hidden="true">→</span>
              </a>
            </div>

            <div className="flex gap-3.5 items-center mt-4 p-3 border border-[#2e2e2e] bg-[#111] xd-rise xd-d6">
              <Image
                src="/safety-poster.webp"
                alt=""
                width={72}
                height={102}
                className="flex-none w-[72px] h-auto border border-[#2e2e2e]"
              />
              <p className="text-[12.5px] leading-snug text-neutral-300">{t(lang, 'carePosterNote')}</p>
            </div>

          </>
        ) : (
          <>
            <h1 className={`${heavy} text-center text-[36px] leading-[0.98] mt-6 xd-rise xd-d4`}>
              {t(lang, 'careTitleM')}
            </h1>
            <p className="text-center text-[15px] leading-relaxed text-neutral-300 mt-4 px-1 xd-rise xd-d5">
              {t(lang, 'careBodyM')}
            </p>
          </>
        )}

        <button type="button" onClick={next} className={`btn-primary ${female ? 'mt-6' : 'mt-9'} xd-rise xd-d7`}>
          {t(lang, 'careGotIt')} →
        </button>
      </section>
    </main>
  );
}

function Shield({ color }: { color: string }) {
  return (
    <div className="relative w-24 h-24 mx-auto grid place-items-center xd-rise xd-d2" aria-hidden="true">
      <div className={`ck-halo ${color === PINK ? 'rose' : ''}`} />
      <svg width="78" height="88" viewBox="0 0 78 88" className="relative">
        <path d="M39 4 72 16v26c0 21-14 36-33 42C20 78 6 63 6 42V16z" fill="#141414" stroke={color} strokeWidth="3" />
        <path d="M39 30c-4-6-14-5-14 3 0 7 9 12 14 17 5-5 14-10 14-17 0-8-10-9-14-3z" fill={color} />
      </svg>
    </div>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="#25D366">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

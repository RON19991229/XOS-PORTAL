'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import { Lang, t } from '@/lib/i18n';
import {
  validateMyIC,
  validatePassport,
  parseICDob,
  calcAge,
  ageCategory,
  digitsOnly,
  parseTimestamp,
} from '@/lib/utils';
import { safeSession, safeLocal } from '@/lib/safe-storage';
import CheckinHeader from '@/components/CheckinHeader';
import { Atmo, StepRail } from '@/components/CheckinFX';
import ScrollHint from '@/components/ScrollHint';

export default function IdInputPage() {
  const router = useRouter();
  const supabase = createClient();
  const [lang, setLang] = useState<Lang>('en');
  const [nationality, setNationality] = useState<'malaysian' | 'foreigner'>('malaysian');
  const [id, setId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const savedLang = safeSession.getItem('xf-lang') as Lang | null;
    if (savedLang) setLang(savedLang);

    const nat = safeSession.getItem('xf-nationality') as 'malaysian' | 'foreigner' | null;
    if (!nat) {
      router.replace('/checkin');
      return;
    }
    setNationality(nat);
  }, [router]);

  const handleIdChange = (raw: string) => {
    setError('');
    if (nationality === 'malaysian') {
      const cleaned = digitsOnly(raw).slice(0, 12);
      setId(cleaned);
    } else {
      const cleaned = raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 20);
      setId(cleaned);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    let validationError: string | null = null;
    if (nationality === 'malaysian') {
      // For Malaysians: validateMyIC checks length, valid DOB, AND valid BP
      // code (place of birth, the 7th-8th digits). If ANY check fails, we
      // show a generic message — never the specific reason — so users who
      // type random digits don't learn which constraint to bypass next.
      // (Admins still get specific reasons in the CSV import flow.)
      if (validateMyIC(id) !== null) {
        validationError = t(lang, 'invalidIc');
      }
    } else {
      validationError = validatePassport(id);
    }
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);

    // ============================================================
    // GLOBAL 30-MINUTE COOLDOWN — based on IC, not customer_id.
    // This applies to ANY recent visit (approved, denied_banned,
    // denied_age) so that banned users / under-age users can't
    // spam the system either.
    // ============================================================
    const { data: recentAnyVisits } = await supabase
      .from('visits')
      .select('visited_at, status')
      .eq('ic', id)
      .order('visited_at', { ascending: false })
      .limit(1);

    if (recentAnyVisits && recentAnyVisits.length > 0) {
      const lastVisit = parseTimestamp(recentAnyVisits[0].visited_at);
      // If the timestamp couldn't be parsed (shouldn't happen now), skip the
      // client cooldown — the DB trigger still enforces it server-side.
      if (lastVisit) {
        const now = new Date();
        const minutesSince = (now.getTime() - lastVisit.getTime()) / 60000;

        if (minutesSince < 30) {
          const remaining = Math.ceil(30 - minutesSince);
          setLoading(false);
          setError(
            lang === 'zh'
              ? `您 ${Math.floor(minutesSince)} 分钟前已尝试入场。请等候 ${remaining} 分钟后再试。`
              : lang === 'ms'
              ? `Anda telah cuba daftar masuk ${Math.floor(minutesSince)} minit yang lalu. Sila tunggu ${remaining} minit lagi.`
              : `You attempted check-in ${Math.floor(minutesSince)} minute(s) ago. Please wait ${remaining} more minutes before trying again.`
          );
          return;
        }
      }
    }

    // Look up customer via secure RPC.
    // Returns minimal fields only: id, nationality, ic, name, dob, status,
    // membership, gender. Phone, emergency contact, and guardian info are
    // NOT exposed to the anon role — they're only readable by authenticated
    // staff/admin via `customers` table. The RPC matches on exact IC, so it
    // cannot be used to enumerate or pattern-search.
    const { data: customers, error: dbError } = await supabase
      .rpc('lookup_customer_for_checkin', { p_ic: id });

    if (dbError) {
      setLoading(false);
      setError(t(lang, 'error'));
      return;
    }

    const customer = customers && customers.length > 0 ? customers[0] : null;

    safeSession.setItem('xf-ic', id);

    // Age check ONLY for Malaysians (foreigners skip)
    if (nationality === 'malaysian') {
      const dob = parseICDob(id);
      const age = calcAge(dob);
      const cat = ageCategory(age);

      if (cat === 'under-12') {
        if (customer) {
          await supabase.from('visits').insert({
            customer_id: customer.id,
            ic: id,
            status: 'denied_age',
          });
        } else {
          await supabase.from('visits').insert({
            customer_id: null,
            ic: id,
            status: 'denied_age',
          });
        }
        safeSession.setItem('xf-age', String(age));
        router.push('/checkin/under-age');
        return;
      }

      safeSession.setItem('xf-age', String(age));
      safeSession.setItem('xf-age-category', cat);
    } else {
      // Foreigner: skip age category, mark as 16+
      safeSession.setItem('xf-age-category', '16-plus');
    }

    // Banned check
    if (customer && customer.status === 'banned') {
      safeSession.setItem('xf-customer', JSON.stringify(customer));
      router.push('/checkin/banned');
      return;
    }

    // Existing active customer → reminders → check-in
    if (customer) {
      safeSession.setItem('xf-customer', JSON.stringify(customer));
      router.push('/checkin/reminders');
      return;
    }

    // New customer → register
    router.push('/checkin/register');
  };

  const placeholder = nationality === 'malaysian'
    ? t(lang, 'icPlaceholder')
    : t(lang, 'passportPlaceholder');

  const title = nationality === 'malaysian'
    ? t(lang, 'enterIc')
    : t(lang, 'enterPassport');

  const flag = nationality === 'malaysian' ? '🇲🇾 MY' : '🌍 INTL';

  return (
    <main className="min-h-screen flex flex-col bg-ink relative">
      <Atmo />

      <CheckinHeader
        lang={lang}
        onLangChange={(l) => { setLang(l); safeLocal.setItem('xf-lang', l); }}
        className="xd-rise xd-d1"
      />

      <StepRail step={1} fillNext className="xd-rise xd-d2" />

      <section className="flex-1 flex flex-col justify-center px-5 py-10 max-w-md mx-auto w-full relative z-[2]">
        <div className="mb-8">
          <p className="font-mono text-[10px] tracking-[0.3em] text-accent mb-3 xd-rise xd-d2">
            // {flag}
          </p>
          <h1 className="font-display text-5xl md:text-6xl leading-[0.85] xd-rise xd-d3">
            {title}
          </h1>
          <div className="xd-ubar" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="xd-rise xd-d4">
            <input
              type="text"
              inputMode={nationality === 'malaysian' ? 'numeric' : 'text'}
              autoComplete="off"
              autoCapitalize="characters"
              autoFocus
              value={id}
              onChange={(e) => handleIdChange(e.target.value)}
              placeholder={placeholder}
              className="input-field-lg"
              maxLength={nationality === 'malaysian' ? 12 : 20}
            />
            {nationality === 'malaysian' && (
              <>
                {/* 12-digit progress segments — one tick lights per digit */}
                <div className="xd-segs" aria-hidden="true">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <div key={i} className={`xd-seg ${i < id.length ? 'f' : ''}`} />
                  ))}
                </div>
                <div className="flex justify-between text-xs font-mono text-neutral-500 mt-2">
                  <span className="text-[10px] tracking-[0.18em]">12 DIGITS</span>
                  <span>{id.length}/12</span>
                </div>
              </>
            )}
          </div>

          {error && (
            <div className="bg-danger text-bone px-4 py-3 font-display text-sm tracking-wider animate-shake">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !id.trim()}
            className="btn-primary xd-rise xd-d5"
          >
            {loading ? (
              <span className="flex gap-1.5 justify-center">
                <span className="loading-dot inline-block w-2 h-2 bg-ink rounded-full" />
                <span className="loading-dot inline-block w-2 h-2 bg-ink rounded-full" />
                <span className="loading-dot inline-block w-2 h-2 bg-ink rounded-full" />
              </span>
            ) : (
              <>{t(lang, 'continue')} →</>
            )}
          </button>

          <button
            type="button"
            onClick={() => router.push('/checkin')}
            className="btn-secondary xd-rise xd-d6"
          >
            ← {t(lang, 'changeNationality')}
          </button>
        </form>

        {/* Bottom spacer — see /checkin/page.tsx for rationale */}
        <div className="h-20" aria-hidden="true" />
      </section>

      {/* ScrollHint — auto-hides if the page already fits in the viewport */}
      <ScrollHint />
    </main>
  );
}

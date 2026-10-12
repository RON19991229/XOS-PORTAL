'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import { Lang, t } from '@/lib/i18n';
import {
  digitsOnly,
  buildPhone,
  validatePhone,
  validateMyIC,
  type AgeCategory,
} from '@/lib/utils';
import { safeSession } from '@/lib/safe-storage';
import CheckinHeader from '@/components/CheckinHeader';
import PhoneInput from '@/components/PhoneInput';
import TermsModal from '@/components/TermsModal';
import { Atmo, StepRail } from '@/components/CheckinFX';

/**
 * v2.23.0 redesign (Ron-approved mockup `mockups/register-redesign.html`):
 *   - green "WELCOME TO X FITNESS" box removed (green = allowed-in elsewhere);
 *     one-line intro in the current language instead
 *   - Atmo + StepRail like the other /checkin pages
 *   - IC shown as a card with CHANGE (back to /checkin/id-input)
 *   - 3 sections (about you / emergency / terms) with a mark when complete
 *   - relationship = tap chips instead of a <select>
 *   - emergency phone may not equal the customer's own phone
 *   - submit button shows "N MORE TO FILL" until complete; it stays
 *     clickable so tapping it still shows which field is wrong
 * Data written to `customers` and all validation rules are unchanged.
 *
 * v2.24.0 (Ron: "看起来很多字，分类很怪"; mockup `mockups/checkin-simplify.html`):
 *   - three numbered blocks: 1 YOU (IC + name + gender + phone),
 *     2 EMERGENCY CONTACT, then one agree line
 *   - relationship chips 9 → 6 (Spouse → Partner, Relative / Guardian →
 *     Other); all 6 values are already allowed by the DB CHECK, no SQL
 *   - inline T&C scroll box → agree line + full text in TermsModal
 *     (with I AGREE); the PDPA note is folded into that line
 *   - no red *, no intro paragraph; submit button sticks to the bottom
 */

const RELATIONSHIPS = ['rel_father', 'rel_mother', 'rel_partner', 'rel_sibling', 'rel_friend', 'rel_other'] as const;

// Stored in customers.emergency_relationship — must stay inside the DB CHECK list.
const RELATIONSHIP_VALUES: Record<typeof RELATIONSHIPS[number], string> = {
  rel_father: 'Father',
  rel_mother: 'Mother',
  rel_partner: 'Partner',
  rel_sibling: 'Sibling',
  rel_friend: 'Friend',
  rel_other: 'Other',
};

export default function RegisterPage() {
  const router = useRouter();
  const supabase = createClient();
  const [lang, setLang] = useState<Lang>('en');
  const [nationality, setNationality] = useState<'malaysian' | 'foreigner'>('malaysian');
  const [ic, setIc] = useState('');
  const [ageCategory, setAgeCategory] = useState<AgeCategory>('unknown');

  const [name, setName] = useState('');
  const [phone, setPhone] = useState({ code: '+60', digits: '' });
  const [relationship, setRelationship] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState({ code: '+60', digits: '' });

  const [guardianIc, setGuardianIc] = useState('');
  const [guardianPhone, setGuardianPhone] = useState({ code: '+60', digits: '' });

  // Foreigners pick gender here; Malaysians get it from the IC (DB trigger customers_autofill_gender).
  const [gender, setGender] = useState<'' | 'male' | 'female'>('');
  const [agreed, setAgreed] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const savedLang = safeSession.getItem('xf-lang') as Lang | null;
    if (savedLang) setLang(savedLang);

    const nat = safeSession.getItem('xf-nationality') as 'malaysian' | 'foreigner' | null;
    if (!nat) { router.replace('/checkin'); return; }
    setNationality(nat);

    const savedIc = safeSession.getItem('xf-ic');
    if (!savedIc) { router.replace('/checkin'); return; }
    setIc(savedIc);

    const cat = safeSession.getItem('xf-age-category') as AgeCategory | null;
    if (cat) setAgeCategory(cat);
  }, [router]);

  // Guardian fields ONLY for Malaysian 12-15 (foreigners skip even if they're young)
  const isMinor = nationality === 'malaysian' && ageCategory === '12-15';

  // Live completeness (drives the section marks and the button label only —
  // the authoritative checks are still in handleSubmit).
  const nameOk = name.trim().length > 0;
  const phoneOk = phone.digits.length > 0 && validatePhone(phone.code, phone.digits) === null;
  const samePhone =
    phone.digits.length > 0 &&
    emergencyPhone.digits.length > 0 &&
    buildPhone(emergencyPhone.code, emergencyPhone.digits) === buildPhone(phone.code, phone.digits);
  const emergencyOk =
    emergencyPhone.digits.length > 0 &&
    validatePhone(emergencyPhone.code, emergencyPhone.digits) === null &&
    !samePhone;
  const guardianIcOk = !isMinor || validateMyIC(guardianIc) === null;
  const guardianPhoneOk =
    !isMinor || (guardianPhone.digits.length > 0 && validatePhone(guardianPhone.code, guardianPhone.digits) === null);
  const genderOk = nationality === 'malaysian' || gender !== '';
  const remaining = [nameOk, genderOk, phoneOk, !!relationship, emergencyOk, guardianIcOk, guardianPhoneOk, agreed]
    .filter((ok) => !ok).length;
  const displayId =
    nationality === 'malaysian' && ic.length === 12
      ? `${ic.slice(0, 6)}-${ic.slice(6, 8)}-${ic.slice(8)}`
      : ic;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError(t(lang, 'fillAllFields'));
      return;
    }

    if (nationality === 'foreigner' && !gender) {
      setError(t(lang, 'genderRequired'));
      return;
    }

    const phoneError = validatePhone(phone.code, phone.digits);
    if (phoneError) {
      setError(phoneError);
      return;
    }

    // Emergency contact is now MANDATORY (per user request 2026-05-06).
    // Both relationship AND phone must be filled.
    if (!relationship) {
      setError(t(lang, 'emergencyRequired'));
      return;
    }
    if (!emergencyPhone.digits.trim()) {
      setError(t(lang, 'emergencyRequired'));
      return;
    }
    const empPhoneError = validatePhone(emergencyPhone.code, emergencyPhone.digits);
    if (empPhoneError) {
      setError('Emergency: ' + empPhoneError);
      return;
    }
    if (buildPhone(emergencyPhone.code, emergencyPhone.digits) === buildPhone(phone.code, phone.digits)) {
      setError(t(lang, 'regSamePhone'));
      return;
    }

    if (isMinor) {
      // Same masking as the main IC field — a generic message protects against
      // users probing which constraint failed.
      if (validateMyIC(guardianIc) !== null) {
        setError('Guardian: ' + t(lang, 'invalidIc'));
        return;
      }
      const gphoneError = validatePhone(guardianPhone.code, guardianPhone.digits);
      if (gphoneError) {
        setError('Guardian Phone: ' + gphoneError);
        return;
      }
    }

    if (!agreed) {
      setError(t(lang, 'mustAgree'));
      return;
    }

    setLoading(true);

    const fullPhone = buildPhone(phone.code, phone.digits);
    const fullEmergencyPhone = buildPhone(emergencyPhone.code, emergencyPhone.digits);
    const fullGuardianPhone = isMinor
      ? buildPhone(guardianPhone.code, guardianPhone.digits)
      : null;

    // Phone duplicate check via secure RPC.
    // Returns only id + status — never the IC/name/etc of whoever owns
    // that phone, so this can't be abused to look someone up by phone.
    const { data: existingPhoneRows } = await supabase
      .rpc('lookup_customer_by_phone', { p_phone: fullPhone });
    const existingPhone = existingPhoneRows && existingPhoneRows.length > 0
      ? existingPhoneRows[0]
      : null;

    if (existingPhone) {
      setLoading(false);
      if (existingPhone.status === 'banned') {
        // The user just typed their own IC, so look them up via the checkin
        // RPC to display the banned page. RPC returns minimal fields, but
        // the banned page only renders name + ic — which the RPC includes.
        const { data: bannedRows } = await supabase
          .rpc('lookup_customer_for_checkin', { p_ic: ic });
        const banned = bannedRows && bannedRows.length > 0 ? bannedRows[0] : null;
        if (banned) {
          safeSession.setItem('xf-customer', JSON.stringify(banned));
          router.push('/checkin/banned');
          return;
        }
      }
      setError(t(lang, 'duplicatePhone'));
      return;
    }

    let dob: string | null = null;
    if (nationality === 'malaysian') {
      const yy = parseInt(ic.slice(0, 2));
      const year = yy <= 29 ? 2000 + yy : 1900 + yy;
      const mm = parseInt(ic.slice(2, 4));
      const dd = parseInt(ic.slice(4, 6));
      const dobDate = new Date(year, mm - 1, dd);
      dob = dobDate.toISOString().split('T')[0];
    }

    // Insert the new customer. We don't .select() back the row because anon
    // no longer has SELECT permission on customers (PII protection — see
    // migration-v2.7-security-hardening.sql). Instead we re-fetch the just-
    // inserted row via the secure RPC, which returns the minimal subset
    // needed for the rest of the /checkin/* flow.
    const { error: insertError } = await supabase
      .from('customers')
      .insert({
        nationality,
        ic,
        name: name.trim().toUpperCase(),
        phone: fullPhone,
        dob,
        emergency_relationship: relationship ? RELATIONSHIP_VALUES[relationship as keyof typeof RELATIONSHIP_VALUES] : null,
        emergency_phone: fullEmergencyPhone,
        guardian_ic: isMinor ? guardianIc : null,
        guardian_phone: fullGuardianPhone,
        // Only sent for foreigners — Malaysian gender is derived from the IC by the DB trigger.
        ...(nationality === 'foreigner' && gender ? { gender } : {}),
      });

    if (insertError) {
      setLoading(false);
      if (insertError.code === '23505') {
        if (insertError.message.includes('phone')) {
          setError(t(lang, 'duplicatePhone'));
        } else {
          setError(t(lang, 'duplicateIc'));
        }
      } else {
        setError(t(lang, 'error') + ': ' + insertError.message);
      }
      return;
    }

    // Re-fetch the newly inserted customer via the RPC (read-back).
    const { data: createdRows } = await supabase
      .rpc('lookup_customer_for_checkin', { p_ic: ic });
    const customer = createdRows && createdRows.length > 0 ? createdRows[0] : null;

    if (!customer) {
      // INSERT succeeded but lookup somehow returned nothing — shouldn't
      // happen, but handle gracefully so the user sees a clear message
      // instead of a blank page.
      setLoading(false);
      setError(t(lang, 'error'));
      return;
    }

    safeSession.setItem('xf-customer', JSON.stringify(customer));
    // v2.23.0: first registration → one-time care page, then the rules page.
    router.push('/checkin/care');
  };

  const youOk = nameOk && genderOk && phoneOk;
  const emergencyDone = !!relationship && emergencyOk;

  return (
    <main className="min-h-screen flex flex-col bg-ink relative">
      <Atmo />

      <CheckinHeader
        className="xd-rise xd-d1"
        rightSlot={
          <button
            onClick={() => router.push('/checkin')}
            className="font-mono text-xs underline underline-offset-4 text-neutral-400"
          >
            ← {t(lang, 'back')}
          </button>
        }
      />

      <StepRail step={1} fillNext className="xd-rise xd-d2" />

      <section className="flex-1 flex flex-col px-5 pt-6 max-w-md mx-auto w-full relative z-[2]">
        <h1 className="font-display text-[34px] leading-[0.95] xd-rise xd-d2">{t(lang, 'register')}</h1>
        <p className="font-mono text-[11px] tracking-[0.12em] text-neutral-400 mt-2 mb-5 xd-rise xd-d3">
          {t(lang, 'regSub')}
        </p>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col xd-rise xd-d4">
          {/* 1 · YOU */}
          <RegBlock n={1} title={t(lang, 'regYou')} done={youOk}>
            <Field label={t(lang, nationality === 'malaysian' ? 'regIcLabel' : 'regPassportLabel')}>
              <div className="flex items-center gap-2.5 bg-ink-soft border-2 border-[#222] px-3 py-2.5">
                <span className="text-lg leading-none" aria-hidden="true">
                  {nationality === 'malaysian' ? '🇲🇾' : '🌍'}
                </span>
                <span className="flex-1 min-w-0 font-mono text-base tracking-[0.05em] text-bone truncate">{displayId}</span>
                <button
                  type="button"
                  onClick={() => router.push('/checkin/id-input')}
                  className="font-mono text-[11px] text-neutral-400 underline underline-offset-[3px] px-1 py-1"
                >
                  {t(lang, 'regChange')}
                </button>
              </div>
            </Field>
            <Field label={t(lang, 'fullName')}>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value.toUpperCase())}
                placeholder={t(lang, nationality === 'malaysian' ? 'regNameIc' : 'regNamePassport')}
                className="input-field"
                required
                autoCapitalize="characters"
              />
            </Field>
            {nationality === 'foreigner' && (
              <Field label={t(lang, 'gender')}>
                <div className="grid grid-cols-2 gap-2" role="radiogroup">
                  {(['male', 'female'] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      role="radio"
                      aria-checked={gender === g}
                      onClick={() => setGender(g)}
                      className={`reg-chip gender-${g === 'male' ? 'm' : 'f'} ${gender === g ? 'on' : ''} !py-3 font-display !text-sm tracking-wider`}
                    >
                      <span className="text-lg mr-2" aria-hidden="true">{g === 'male' ? '♂' : '♀'}</span>
                      {t(lang, g)}
                    </button>
                  ))}
                </div>
              </Field>
            )}
            <Field label={t(lang, 'phone')}>
              <PhoneInput value={phone} onChange={setPhone} placeholder="123456789" />
            </Field>
          </RegBlock>

          {/* 2 · EMERGENCY CONTACT — red safety accent (Ron picked option B) */}
          <RegBlock n={2} title={t(lang, 'regEmergency')} done={emergencyDone} safety>
            <div className="flex gap-2 items-start bg-danger/[0.08] border border-danger/30 px-2.5 py-2 -mt-1 mb-3.5 text-xs leading-snug text-[#f0b5b0]">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="#ff6b62" className="flex-none mt-px" aria-hidden="true">
                <path d="M9 2h6v7h7v6h-7v7H9v-7H2V9h7z" />
              </svg>
              <span>
                <b className="text-bone">{t(lang, 'regEmergencySafety')}</b> {t(lang, 'regEmergencyHint')}
              </span>
            </div>
            <Field label={t(lang, 'regWho')}>
              <div className="grid grid-cols-3 gap-2" role="radiogroup">
                {RELATIONSHIPS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    role="radio"
                    aria-checked={relationship === r}
                    onClick={() => setRelationship(r)}
                    className={`reg-chip ${relationship === r ? 'on' : ''}`}
                  >
                    {t(lang, r)}
                  </button>
                ))}
              </div>
            </Field>
            <Field label={t(lang, 'regTheirPhone')}>
              <PhoneInput value={emergencyPhone} onChange={setEmergencyPhone} placeholder="123456789" />
              {samePhone && <p className="text-xs text-[#ffb4ae] mt-2">{t(lang, 'regSamePhone')}</p>}
            </Field>
          </RegBlock>

          {/* Guardian fields - only for Malaysian minors 12-15 */}
          {isMinor && (
            <div className="bg-accent/10 border-2 border-accent p-4 space-y-4 mb-3.5">
              <div>
                <p className="font-display text-sm tracking-widest text-accent mb-1">
                  ⚠ {t(lang, 'guardianRequired')}
                </p>
                <p className="text-xs text-neutral-300">{t(lang, 'guardianAge')}</p>
              </div>

              <div>
                <label className="field-label">{t(lang, 'guardianIc')}</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={guardianIc}
                  onChange={(e) => setGuardianIc(digitsOnly(e.target.value).slice(0, 12))}
                  placeholder={t(lang, 'guardianPlaceholder')}
                  className="input-field"
                  maxLength={12}
                />
              </div>

              <div>
                <label className="field-label">{t(lang, 'guardianPhone')}</label>
                <PhoneInput value={guardianPhone} onChange={setGuardianPhone} />
              </div>
            </div>
          )}

          {/* 3 · AGREE — the full text opens in TermsModal */}
          <label className={`reg-agree ${agreed ? 'on' : ''}`}>
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="sr-only"
            />
            <span className="reg-agree-box" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 16 16">
                <path d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="#0a0a0a" strokeWidth="2.6" strokeLinecap="square" />
              </svg>
            </span>
            <span className="text-sm leading-relaxed text-neutral-200">
              {t(lang, 'regAgreeA')}
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowTerms(true);
                }}
                className="text-accent underline underline-offset-[3px]"
              >
                {t(lang, 'regAgreeLink')}
              </button>
              {t(lang, 'regAgreeB')}
            </span>
          </label>

          {/* Submit — sticks to the bottom of the screen while scrolling */}
          <div className="sticky bottom-0 mt-auto -mx-5 px-5 pt-6 pb-[max(18px,env(safe-area-inset-bottom))] bg-gradient-to-b from-transparent via-ink/95 to-ink z-10">
            {error && (
              <div className="bg-danger text-bone px-4 py-3 mb-3 font-display text-sm tracking-wider animate-shake">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className={`btn-primary ${remaining > 0 && !loading ? 'reg-incomplete' : ''}`}
            >
              {loading ? (
                <span className="flex gap-1.5 justify-center">
                  <span className="loading-dot inline-block w-2 h-2 bg-ink rounded-full" />
                  <span className="loading-dot inline-block w-2 h-2 bg-ink rounded-full" />
                  <span className="loading-dot inline-block w-2 h-2 bg-ink rounded-full" />
                </span>
              ) : remaining > 0 ? (
                t(lang, 'regMoreToFill').replace('{n}', String(remaining))
              ) : (
                <>{t(lang, 'submit')} →</>
              )}
            </button>
          </div>
        </form>
      </section>

      <TermsModal
        open={showTerms}
        onClose={() => setShowTerms(false)}
        onAgree={() => {
          setAgreed(true);
          setShowTerms(false);
        }}
        closeLabel={t(lang, 'close')}
        agreeLabel={t(lang, 'iAgree')}
      />
    </main>
  );
}

function RegBlock({
  n,
  title,
  done,
  safety = false,
  children,
}: {
  n: number;
  title: string;
  done: boolean;
  /** Red left edge + shield-with-cross icon (emergency contact). */
  safety?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`border bg-[#111] px-3.5 py-4 mb-3.5 transition-colors ${done ? 'border-success-green/45' : 'border-[#262626]'} ${safety ? '!border-l-[3px] !border-l-danger' : ''}`}
    >
      <div className="flex items-center gap-2.5 mb-3.5">
        <span
          className={`w-6 h-6 grid place-items-center flex-none font-display text-[13px] text-ink transition-colors ${done ? 'bg-success-green' : 'bg-accent'}`}
          aria-hidden="true"
        >
          {done ? '✓' : n}
        </span>
        <h2 className="font-display text-[15px] tracking-[0.03em]">{title}</h2>
        {safety && (
          <svg width="22" height="25" viewBox="0 0 78 88" className="ml-auto flex-none" aria-hidden="true">
            <path d="M39 4 72 16v26c0 21-14 36-33 42C20 78 6 63 6 42V16z" fill="#ff3b30" />
            <path d="M33 26h12v13h13v12H45v13H33V51H20V39h13z" fill="#0a0a0a" />
          </svg>
        )}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 last:mb-0">
      <p className="font-mono text-[10px] tracking-[0.16em] text-neutral-400 mb-1.5">{label}</p>
      {children}
    </div>
  );
}

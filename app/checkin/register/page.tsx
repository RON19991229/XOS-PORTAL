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
import TermsContent from '@/components/TermsContent';
import ScrollHint from '@/components/ScrollHint';
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
 */

const RELATIONSHIPS = [
  'rel_friend',
  'rel_partner',
  'rel_father',
  'rel_mother',
  'rel_relative',
  'rel_guardian',
  'rel_sibling',
  'rel_spouse',
  'rel_other',
] as const;

const RELATIONSHIP_VALUES: Record<typeof RELATIONSHIPS[number], string> = {
  rel_friend: 'Friend',
  rel_partner: 'Partner',
  rel_father: 'Father',
  rel_mother: 'Mother',
  rel_relative: 'Relative',
  rel_guardian: 'Guardian',
  rel_sibling: 'Sibling',
  rel_spouse: 'Spouse',
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
    // v2.23.0: first registration → one-time care page, then the rules.
    router.push('/checkin/care');
  };

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

      <section className="flex-1 px-5 pt-7 pb-8 max-w-md mx-auto w-full relative z-[2]">
        <div className="mb-6">
          <p className="font-mono text-[10px] tracking-[0.3em] text-accent mb-3 xd-rise xd-d2">
            // {t(lang, 'firstTime')}
          </p>
          <h1 className="font-display text-5xl leading-[0.85] xd-rise xd-d3">
            {t(lang, 'register')}
          </h1>
          <div className="xd-ubar" />
          <p className="text-sm leading-relaxed text-neutral-400 mt-4 xd-rise xd-d4">
            {t(lang, nationality === 'malaysian' ? 'regIntroIc' : 'regIntroPassport')}
          </p>
        </div>

        {/* Verified ID card */}
        <div className="reg-idcard mb-7 xd-rise xd-d4">
          <span className="text-[22px] leading-none" aria-hidden="true">
            {nationality === 'malaysian' ? '🇲🇾' : '🌍'}
          </span>
          <div className="flex-1 min-w-0">
            <div className="font-mono text-[9px] tracking-[0.2em] text-neutral-500 mb-0.5">
              {t(lang, nationality === 'malaysian' ? 'regIcLabel' : 'regPassportLabel')}
            </div>
            <div className="font-mono text-[17px] tracking-[0.06em] text-bone truncate">{displayId}</div>
          </div>
          <button
            type="button"
            onClick={() => router.push('/checkin/id-input')}
            className="border border-[#3a3a3a] text-neutral-300 font-mono text-[10px] tracking-[0.12em] px-2.5 py-2"
          >
            {t(lang, 'regChange')}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="xd-rise xd-d5">
          {/* ABOUT YOU */}
          <div className="mb-7">
            <SectionHead title={t(lang, 'regAboutYou')} done={nameOk && genderOk && phoneOk} doneLabel={t(lang, 'regDone')} />
            <div className="mb-3.5">
              <label className="field-label">
                {t(lang, 'fullName')} <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value.toUpperCase())}
                placeholder={t(lang, nationality === 'malaysian' ? 'regNameIc' : 'regNamePassport')}
                className="input-field"
                required
                autoCapitalize="characters"
              />
            </div>
            {nationality === 'foreigner' && (
              <div className="mb-3.5">
                <label className="field-label">
                  {t(lang, 'gender')} <span className="text-danger">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2" role="radiogroup">
                  {(['male', 'female'] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      role="radio"
                      aria-checked={gender === g}
                      onClick={() => setGender(g)}
                      className={`reg-chip gender-${g === 'male' ? 'm' : 'f'} ${gender === g ? 'on' : ''} !py-3.5 font-display !text-sm tracking-wider`}
                    >
                      <span className="text-lg mr-2" aria-hidden="true">{g === 'male' ? '♂' : '♀'}</span>
                      {t(lang, g)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label className="field-label">
                {t(lang, 'phone')} <span className="text-danger">*</span>
              </label>
              <PhoneInput value={phone} onChange={setPhone} placeholder="123456789" />
            </div>
          </div>

          {/* EMERGENCY CONTACT */}
          <div className="mb-7">
            <SectionHead
              title={t(lang, 'regEmergency')}
              done={!!relationship && emergencyOk}
              doneLabel={t(lang, 'regDone')}
            />
            <p className="text-[13px] leading-snug text-neutral-500 -mt-1 mb-3.5">
              {t(lang, 'regEmergencyHint')}
            </p>
            <div className="mb-3.5">
              <label className="field-label">
                {t(lang, 'regRelationship')} <span className="text-danger">*</span>
              </label>
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
            </div>
            <div>
              <label className="field-label">
                {t(lang, 'regTheirPhone')} <span className="text-danger">*</span>
              </label>
              <PhoneInput
                value={emergencyPhone}
                onChange={setEmergencyPhone}
                placeholder="123456789"
              />
              {samePhone && (
                <p className="text-xs text-[#ffb4ae] mt-2">{t(lang, 'regSamePhone')}</p>
              )}
            </div>
          </div>

          {/* Guardian fields - only for Malaysian minors 12-15 */}
          {isMinor && (
            <div className="bg-accent/10 border-2 border-accent p-4 space-y-4 mb-7">
              <div>
                <p className="font-display text-sm tracking-widest text-accent mb-1">
                  ⚠ {t(lang, 'guardianRequired')}
                </p>
                <p className="text-xs text-neutral-300">{t(lang, 'guardianAge')}</p>
              </div>

              <div>
                <label className="field-label">
                  {t(lang, 'guardianIc')} <span className="text-danger">*</span>
                </label>
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
                <label className="field-label">
                  {t(lang, 'guardianPhone')} <span className="text-danger">*</span>
                </label>
                <PhoneInput value={guardianPhone} onChange={setGuardianPhone} />
              </div>
            </div>
          )}

          {/* TERMS */}
          <div className="mb-6">
            <SectionHead title={t(lang, 'regTerms')} done={agreed} doneLabel={t(lang, 'regDone')} />
            <TermsContent scrollLabel={t(lang, 'regScrollToRead')} readLabel={t(lang, 'regReadDone')} />
            <label className={`reg-agree mt-2.5 ${agreed ? 'on' : ''}`}>
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
                {t(lang, 'agreeTerms')}
              </span>
            </label>
          </div>

          {error && (
            <div className="bg-danger text-bone px-4 py-3 mb-4 font-display text-sm tracking-wider animate-shake">
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

          <p className="text-[11.5px] text-neutral-500 text-center mt-3.5 leading-normal">
            🔒 {t(lang, 'regPdpaNote')}
          </p>
        </form>

        {/* Bottom spacer — see /checkin/page.tsx for rationale */}
        <div className="h-20" aria-hidden="true" />
      </section>

      {/* ScrollHint — auto-hides if the page already fits in the viewport */}
      <ScrollHint />
    </main>
  );
}

function SectionHead({ title, done, doneLabel }: { title: string; done: boolean; doneLabel: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-3.5">
      <span className="w-2 h-2 bg-accent flex-none" aria-hidden="true" />
      <h2 className="font-display text-[15px] tracking-[0.06em]">{title}</h2>
      <span className="flex-1 h-px bg-ink-line" aria-hidden="true" />
      <span
        className={`font-mono text-[10px] tracking-[0.1em] text-success-green transition-opacity ${done ? 'opacity-100' : 'opacity-0'}`}
      >
        {doneLabel}
      </span>
    </div>
  );
}

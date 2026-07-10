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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError(t(lang, 'fillAllFields'));
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
    router.push('/checkin/reminders');
  };

  return (
    <main className="min-h-screen flex flex-col bg-ink">
      <CheckinHeader
        rightSlot={
          <button
            onClick={() => router.push('/checkin')}
            className="font-mono text-xs underline underline-offset-4 text-neutral-400"
          >
            ← {t(lang, 'back')}
          </button>
        }
      />

      <section className="flex-1 px-5 py-8 max-w-md mx-auto w-full">
        <div className="mb-6">
          <p className="font-mono text-[10px] tracking-[0.3em] text-accent mb-3">
            // {t(lang, 'firstTime')}
          </p>
          <h1 className="font-display text-4xl md:text-5xl leading-[0.85] mb-3">
            {t(lang, 'register')}
          </h1>
          <div className="h-1 w-16 bg-accent mb-4" />

          {/* Welcome card explaining "register once" */}
          <div className="border-2 border-success-green bg-gradient-to-br from-ink-soft to-ink p-4 text-center">
            <p className="font-mono text-[10px] tracking-[0.3em] text-success-green mb-2">
              {t(lang, 'welcomeToXFitness')}
            </p>
            <p className="font-display text-2xl text-success-green leading-none mb-3">
              X FITNESS
            </p>
            <p className="font-display text-sm text-bone leading-snug">
              {t(lang, 'taglinePrimary')}
            </p>
            <p className="font-mono text-[10px] text-neutral-400 mt-1">
              {t(lang, 'taglineSecondary')}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="field-label">
              {nationality === 'malaysian' ? 'IC NUMBER' : 'PASSPORT'}
            </label>
            <input value={ic} disabled className="input-field" />
          </div>

          <div>
            <label className="field-label">
              {t(lang, 'fullName')} <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.toUpperCase())}
              placeholder={t(lang, 'namePlaceholder')}
              className="input-field"
              required
              autoCapitalize="characters"
            />
          </div>

          <div>
            <label className="field-label">
              {t(lang, 'phone')} <span className="text-danger">*</span>
            </label>
            <PhoneInput value={phone} onChange={setPhone} placeholder="123456789" />
          </div>

          <div>
            <label className="field-label">
              {t(lang, 'relationship')} <span className="text-danger">*</span>
            </label>
            <select
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
              className="input-field"
              required
            >
              <option value="">{t(lang, 'relationshipChoose')}</option>
              {RELATIONSHIPS.map((r) => (
                <option key={r} value={r}>{t(lang, r)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="field-label">
              {t(lang, 'emergencyPhone')} <span className="text-danger">*</span>
            </label>
            <PhoneInput
              value={emergencyPhone}
              onChange={setEmergencyPhone}
              placeholder="123456789"
            />
          </div>

          {/* Guardian fields - only for Malaysian minors 12-15 */}
          {isMinor && (
            <div className="bg-accent/10 border-2 border-accent p-4 space-y-4">
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

          <div className="pt-2">
            <label className="field-label">
              TERMS & CONDITIONS <span className="text-danger">*</span>
            </label>
            <TermsContent />
          </div>

          <label className="flex items-start gap-3 cursor-pointer bg-accent/10 border-2 border-accent p-4">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="w-5 h-5 mt-0.5 accent-accent flex-shrink-0"
            />
            <span className="text-sm leading-relaxed">
              {t(lang, 'agreeTerms')}
            </span>
          </label>

          {error && (
            <div className="bg-danger text-bone px-4 py-3 font-display text-sm tracking-wider animate-shake">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary"
          >
            {loading ? (
              <span className="flex gap-1.5 justify-center">
                <span className="loading-dot inline-block w-2 h-2 bg-ink rounded-full" />
                <span className="loading-dot inline-block w-2 h-2 bg-ink rounded-full" />
                <span className="loading-dot inline-block w-2 h-2 bg-ink rounded-full" />
              </span>
            ) : (
              <>{t(lang, 'submit')} →</>
            )}
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

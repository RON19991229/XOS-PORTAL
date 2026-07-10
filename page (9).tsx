'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import {
  digitsOnly,
  buildPhone,
  validatePhone,
  validateMyIC,
  validatePassport,
  parseICDob,
} from '@/lib/utils';
import PhoneInput from '@/components/PhoneInput';

const RELATIONSHIPS = ['Friend', 'Partner', 'Father', 'Mother', 'Relative', 'Guardian', 'Sibling', 'Spouse', 'Other'];

interface NewCustomerClientProps {
  userId: string;
  userName: string;
}

export default function NewCustomerClient({ userId, userName }: NewCustomerClientProps) {
  const router = useRouter();
  const supabase = createClient();

  const [nationality, setNationality] = useState<'malaysian' | 'foreigner'>('malaysian');
  const [ic, setIc] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState({ code: '+60', digits: '' });
  const [relationship, setRelationship] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState({ code: '+60', digits: '' });
  const [guardianIc, setGuardianIc] = useState('');
  const [guardianPhone, setGuardianPhone] = useState({ code: '+60', digits: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleIcChange = (raw: string) => {
    setError('');
    if (nationality === 'malaysian') {
      setIc(digitsOnly(raw).slice(0, 12));
    } else {
      setIc(raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 20));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate IC/passport
    const idError = nationality === 'malaysian' ? validateMyIC(ic) : validatePassport(ic);
    if (idError) {
      setError(idError);
      return;
    }

    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    const phoneError = validatePhone(phone.code, phone.digits);
    if (phoneError) {
      setError(phoneError);
      return;
    }

    const hasEmergencyRel = !!relationship;
    const hasEmergencyPhone = !!emergencyPhone.digits.trim();
    if (hasEmergencyRel !== hasEmergencyPhone) {
      setError('Emergency: fill both relationship AND phone, or both empty');
      return;
    }
    if (hasEmergencyPhone) {
      const e2 = validatePhone(emergencyPhone.code, emergencyPhone.digits);
      if (e2) { setError('Emergency: ' + e2); return; }
    }

    if (guardianIc.trim()) {
      const gie = validateMyIC(guardianIc);
      if (gie) { setError('Guardian IC: ' + gie); return; }
      const gpe = validatePhone(guardianPhone.code, guardianPhone.digits);
      if (gpe) { setError('Guardian Phone: ' + gpe); return; }
    }

    setLoading(true);

    const fullPhone = buildPhone(phone.code, phone.digits);
    const fullEmergencyPhone = hasEmergencyPhone
      ? buildPhone(emergencyPhone.code, emergencyPhone.digits)
      : null;
    const fullGuardianPhone = guardianIc.trim()
      ? buildPhone(guardianPhone.code, guardianPhone.digits)
      : null;

    let dob: string | null = null;
    if (nationality === 'malaysian') {
      const dobDate = parseICDob(ic);
      if (dobDate) dob = dobDate.toISOString().split('T')[0];
    }

    const { data: customer, error: insertError } = await supabase
      .from('customers')
      .insert({
        nationality,
        ic,
        name: name.trim().toUpperCase(),
        phone: fullPhone,
        dob,
        emergency_relationship: relationship || null,
        emergency_phone: fullEmergencyPhone,
        guardian_ic: guardianIc.trim() || null,
        guardian_phone: fullGuardianPhone,
      })
      .select()
      .single();

    if (insertError || !customer) {
      setLoading(false);
      if (insertError?.code === '23505') {
        if (insertError.message.includes('phone')) {
          setError('This phone number is already registered');
        } else {
          setError('This IC/Passport is already registered');
        }
      } else {
        setError('Create failed: ' + (insertError?.message || 'unknown error'));
      }
      return;
    }

    // Audit log
    await supabase.from('audit_log').insert({
      user_id: userId,
      user_name: userName,
      action: 'create_customer',
      customer_id: customer.id,
      details: { name: customer.name, ic: customer.ic },
    });

    router.push(`/admin/customers/${customer.id}`);
  };

  return (
    <div className="dashboard-light min-h-screen px-4 md:px-6 py-6 max-w-2xl mx-auto">
      <button
        onClick={() => router.push('/admin/customers')}
        className="font-mono text-xs underline underline-offset-4 mb-4 text-neutral-600"
      >
        ← BACK TO LIST
      </button>

      <p className="font-mono text-[10px] tracking-[0.3em] text-neutral-500 mb-1">// MANUAL ENTRY</p>
      <h1 className="font-display text-3xl md:text-4xl tracking-tight mb-1">NEW CUSTOMER</h1>
      <div className="h-1 w-12 bg-accent mb-6" />

      <form onSubmit={handleSubmit} className="bg-white border border-neutral-200 p-5 space-y-4">
        <div>
          <label className="font-mono text-[10px] tracking-widest text-neutral-600 block mb-2">
            NATIONALITY *
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setNationality('malaysian'); setIc(''); }}
              className={`flex-1 py-2.5 font-display text-sm tracking-widest border-2 ${nationality === 'malaysian' ? 'bg-ink text-bone border-ink' : 'bg-white text-ink border-neutral-300'}`}
            >
              🇲🇾 MALAYSIAN
            </button>
            <button
              type="button"
              onClick={() => { setNationality('foreigner'); setIc(''); }}
              className={`flex-1 py-2.5 font-display text-sm tracking-widest border-2 ${nationality === 'foreigner' ? 'bg-ink text-bone border-ink' : 'bg-white text-ink border-neutral-300'}`}
            >
              🌍 FOREIGNER
            </button>
          </div>
        </div>

        <div>
          <label className="font-mono text-[10px] tracking-widest text-neutral-600 block mb-1">
            {nationality === 'malaysian' ? 'IC NUMBER (12 digits)' : 'PASSPORT NUMBER'} *
          </label>
          <input
            type="text"
            inputMode={nationality === 'malaysian' ? 'numeric' : 'text'}
            value={ic}
            onChange={(e) => handleIcChange(e.target.value)}
            placeholder={nationality === 'malaysian' ? '12 digits, no dash' : 'Passport number'}
            className="input-field font-mono"
            maxLength={nationality === 'malaysian' ? 12 : 20}
          />
        </div>

        <div>
          <label className="font-mono text-[10px] tracking-widest text-neutral-600 block mb-1">
            FULL NAME *
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value.toUpperCase())}
            placeholder="WILL BE UPPERCASED"
            className="input-field"
            autoCapitalize="characters"
          />
        </div>

        <div>
          <label className="font-mono text-[10px] tracking-widest text-neutral-600 block mb-1">
            PHONE *
          </label>
          <PhoneInput value={phone} onChange={setPhone} />
        </div>

        <div>
          <label className="font-mono text-[10px] tracking-widest text-neutral-600 block mb-1">
            EMERGENCY RELATIONSHIP
          </label>
          <select
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
            className="input-field"
          >
            <option value="">— None —</option>
            {RELATIONSHIPS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        <div>
          <label className="font-mono text-[10px] tracking-widest text-neutral-600 block mb-1">
            EMERGENCY PHONE
          </label>
          <PhoneInput value={emergencyPhone} onChange={setEmergencyPhone} />
        </div>

        {nationality === 'malaysian' && (
          <>
            <div className="border-t border-neutral-200 pt-4">
              <p className="font-mono text-[10px] tracking-widest text-neutral-500 mb-3">
                OPTIONAL: GUARDIAN INFO (for minors 12-15)
              </p>
              <div>
                <label className="font-mono text-[10px] tracking-widest text-neutral-600 block mb-1">
                  GUARDIAN IC
                </label>
                <input
                  value={guardianIc}
                  onChange={(e) => setGuardianIc(digitsOnly(e.target.value).slice(0, 12))}
                  className="input-field font-mono"
                  inputMode="numeric"
                  maxLength={12}
                  placeholder="12 digits"
                />
              </div>
              <div className="mt-3">
                <label className="font-mono text-[10px] tracking-widest text-neutral-600 block mb-1">
                  GUARDIAN PHONE
                </label>
                <PhoneInput value={guardianPhone} onChange={setGuardianPhone} />
              </div>
            </div>
          </>
        )}

        {error && (
          <div className="bg-danger text-white px-3 py-2 text-sm">{error}</div>
        )}

        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? 'CREATING...' : '+ CREATE CUSTOMER'}
        </button>
      </form>
    </div>
  );
}

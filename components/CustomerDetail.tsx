'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import { Customer, Visit, Warning, CustomerNote } from '@/lib/types';
import { formatDateTime, calcAge, COUNTRY_CODES, digitsOnly, buildPhone, validatePhone } from '@/lib/utils';
import PhoneInput from './PhoneInput';

interface CustomerDetailProps {
  customerId: string;
  role: 'staff' | 'admin';
  userId: string;
  userName: string;
  baseHref: '/staff/customers' | '/admin/customers';
}

const RELATIONSHIPS = ['Friend', 'Partner', 'Father', 'Mother', 'Relative', 'Guardian', 'Sibling', 'Spouse', 'Other'];

// Parse a stored full phone like "+60123456789" back into {code, digits}
function parseStoredPhone(stored: string | null): { code: string; digits: string } {
  if (!stored) return { code: '+60', digits: '' };
  // Try to match each country code (longest first to avoid +6 matching before +60)
  const sorted = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length);
  for (const c of sorted) {
    if (stored.startsWith(c.code)) {
      return { code: c.code, digits: stored.slice(c.code.length) };
    }
  }
  // Unknown country code → fallback to MY (shouldn't happen with 173 countries)
  return { code: '+60', digits: stored.replace(/^\+/, '') };
}

export default function CustomerDetail({
  customerId, role, userId, userName, baseHref,
}: CustomerDetailProps) {
  const router = useRouter();
  const supabase = createClient();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [notes, setNotes] = useState<CustomerNote[]>([]);
  const [emergencySuspicious, setEmergencySuspicious] = useState(false);
  const [loading, setLoading] = useState(true);

  const [showBanModal, setShowBanModal] = useState(false);
  const [showUnbanModal, setShowUnbanModal] = useState(false);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteCustomerModal, setShowDeleteCustomerModal] = useState(false);

  const [banReason, setBanReason] = useState('');
  const [warningReason, setWarningReason] = useState('');
  const [noteText, setNoteText] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState({ code: '+60', digits: '' });
  const [editEmergencyRel, setEditEmergencyRel] = useState('');
  const [editEmergencyPhone, setEditEmergencyPhone] = useState({ code: '+60', digits: '' });
  const [editGuardianIc, setEditGuardianIc] = useState('');
  const [editGuardianPhone, setEditGuardianPhone] = useState({ code: '+60', digits: '' });
  const [editError, setEditError] = useState('');

  const fetchAll = async () => {
    const [cust, vis, warns, nts] = await Promise.all([
      supabase.from('customers').select('*').eq('id', customerId).single(),
      supabase.from('visits').select('*').eq('customer_id', customerId).order('visited_at', { ascending: false }).limit(50),
      supabase.from('warnings').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }),
      supabase.from('customer_notes').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }),
    ]);

    if (cust.data) {
      setCustomer(cust.data);
      if (cust.data.emergency_phone) {
        const { data: matchBanned } = await supabase
          .from('customers')
          .select('id')
          .eq('phone', cust.data.emergency_phone)
          .eq('status', 'banned')
          .maybeSingle();
        setEmergencySuspicious(!!matchBanned);
      }
    }
    if (vis.data) setVisits(vis.data);
    if (warns.data) setWarnings(warns.data);
    if (nts.data) setNotes(nts.data);
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  const logAudit = async (action: string, details: Record<string, unknown> = {}) => {
    await supabase.from('audit_log').insert({
      user_id: userId,
      user_name: userName,
      action,
      customer_id: customerId,
      details,
    });
  };

  const openEditModal = () => {
    if (!customer) return;
    setEditName(customer.name);
    setEditPhone(parseStoredPhone(customer.phone));
    setEditEmergencyRel(customer.emergency_relationship || '');
    setEditEmergencyPhone(parseStoredPhone(customer.emergency_phone));
    setEditGuardianIc(customer.guardian_ic || '');
    setEditGuardianPhone(parseStoredPhone(customer.guardian_phone));
    setEditError('');
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!customer) return;
    setEditError('');

    if (!editName.trim()) {
      setEditError('Name is required');
      return;
    }
    const phoneError = validatePhone(editPhone.code, editPhone.digits);
    if (phoneError) {
      setEditError(phoneError);
      return;
    }

    const hasEmergencyPhone = !!editEmergencyPhone.digits.trim();
    const hasEmergencyRel = !!editEmergencyRel;
    if (hasEmergencyPhone !== hasEmergencyRel) {
      setEditError('Emergency: fill both relationship AND phone, or both empty');
      return;
    }
    if (hasEmergencyPhone) {
      const e = validatePhone(editEmergencyPhone.code, editEmergencyPhone.digits);
      if (e) { setEditError('Emergency: ' + e); return; }
    }

    setActionLoading(true);

    const newPhone = buildPhone(editPhone.code, editPhone.digits);
    const newEmergencyPhone = hasEmergencyPhone ? buildPhone(editEmergencyPhone.code, editEmergencyPhone.digits) : null;

    // Check phone uniqueness if changed
    if (newPhone !== customer.phone) {
      const { data: dup } = await supabase
        .from('customers')
        .select('id')
        .eq('phone', newPhone)
        .neq('id', customerId)
        .maybeSingle();
      if (dup) {
        setActionLoading(false);
        setEditError('This phone number is already used by another customer');
        return;
      }
    }

    const updates: Record<string, unknown> = {
      name: editName.trim().toUpperCase(),
      phone: newPhone,
      emergency_relationship: editEmergencyRel || null,
      emergency_phone: newEmergencyPhone,
    };

    if (editGuardianIc.trim()) {
      updates.guardian_ic = editGuardianIc.trim();
      updates.guardian_phone = editGuardianPhone.digits ? buildPhone(editGuardianPhone.code, editGuardianPhone.digits) : null;
    } else {
      updates.guardian_ic = null;
      updates.guardian_phone = null;
    }

    const { error } = await supabase
      .from('customers')
      .update(updates)
      .eq('id', customerId);

    if (error) {
      setActionLoading(false);
      setEditError('Update failed: ' + error.message);
      return;
    }

    await logAudit('edit_customer', { fields: Object.keys(updates) });
    setShowEditModal(false);
    setActionLoading(false);
    await fetchAll();
  };

  const handleDeleteCustomer = async () => {
    if (!customer) return;
    setActionLoading(true);

    // Audit log first (before actual delete)
    await logAudit('delete_customer', { name: customer.name, ic: customer.ic });

    const { error } = await supabase
      .from('customers')
      .delete()
      .eq('id', customerId);

    setActionLoading(false);

    if (error) {
      alert('Delete failed: ' + error.message);
      return;
    }

    router.push(baseHref);
  };

  const handleDeleteVisit = async (visitId: string, visitTime: string) => {
    if (!confirm(`Delete visit at ${formatDateTime(visitTime)}?`)) return;
    const { error } = await supabase.from('visits').delete().eq('id', visitId);
    if (error) {
      alert('Delete failed: ' + error.message);
      return;
    }
    await logAudit('delete_visit', { visit_time: visitTime });
    await fetchAll();
  };

  const handleAddWarning = async () => {
    if (!customer || !warningReason.trim()) return;
    setActionLoading(true);
    const newCount = Math.min(customer.warning_count + 1, 3);
    await supabase.from('warnings').insert({
      customer_id: customerId,
      reason: warningReason.trim(),
      added_by: userId,
      added_by_name: userName,
    });
    await supabase.from('customers').update({ warning_count: newCount }).eq('id', customerId);
    await logAudit('add_warning', { reason: warningReason.trim(), new_count: newCount });
    setWarningReason('');
    setShowWarningModal(false);
    setActionLoading(false);
    await fetchAll();
  };

  const handleBan = async () => {
    if (!customer || !banReason.trim()) return;
    setActionLoading(true);
    await supabase.from('customers').update({
      status: 'banned',
      ban_reason: banReason.trim(),
      banned_at: new Date().toISOString(),
      banned_by: userId,
    }).eq('id', customerId);
    await logAudit('ban', { reason: banReason.trim() });
    setBanReason('');
    setShowBanModal(false);
    setActionLoading(false);
    await fetchAll();
  };

  const handleUnban = async () => {
    if (!customer) return;
    setActionLoading(true);
    await supabase.from('customers').update({
      status: 'active',
      ban_reason: null,
      banned_at: null,
      banned_by: null,
    }).eq('id', customerId);
    await logAudit('unban', {});
    setShowUnbanModal(false);
    setActionLoading(false);
    await fetchAll();
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    setActionLoading(true);
    await supabase.from('customer_notes').insert({
      customer_id: customerId,
      note: noteText.trim(),
      added_by: userId,
      added_by_name: userName,
    });
    await logAudit('add_note', { note: noteText.trim() });
    setNoteText('');
    setShowNoteModal(false);
    setActionLoading(false);
    await fetchAll();
  };

  const handleResetWarnings = async () => {
    if (!confirm('Reset warnings to 0?')) return;
    setActionLoading(true);
    await supabase.from('customers').update({ warning_count: 0 }).eq('id', customerId);
    await logAudit('reset_warnings', {});
    setActionLoading(false);
    await fetchAll();
  };

  // Toggle membership tag (admin only). NULL = no tag, 'member' = member.
  const handleToggleMembership = async () => {
    if (!customer) return;
    const newValue = customer.membership === 'member' ? null : 'member';
    setActionLoading(true);
    const { error } = await supabase
      .from('customers')
      .update({ membership: newValue })
      .eq('id', customerId);
    if (error) {
      alert('Failed to update membership: ' + error.message);
    } else {
      await logAudit('toggle_membership', { from: customer.membership, to: newValue });
    }
    setActionLoading(false);
    await fetchAll();
  };

  if (loading) {
    return <div className="dashboard-light min-h-screen px-6 py-8 font-mono">Loading...</div>;
  }

  if (!customer) {
    return (
      <div className="dashboard-light min-h-screen px-6 py-8">
        <p className="font-display text-2xl">CUSTOMER NOT FOUND</p>
      </div>
    );
  }

  const isBanned = customer.status === 'banned';
  const isAdmin = role === 'admin';
  const age = customer.dob ? calcAge(new Date(customer.dob)) : null;
  const approvedVisits = visits.filter((v) => v.status === 'approved').length;

  return (
    <div className="dashboard-light min-h-screen px-4 md:px-6 py-6 max-w-4xl mx-auto">
      <button
        onClick={() => router.push(baseHref)}
        className="font-mono text-xs underline underline-offset-4 mb-4 text-neutral-600"
      >
        ← BACK TO LIST
      </button>

      {isBanned && (
        <div className="bg-danger text-white p-5 mb-6">
          <p className="font-display text-3xl tracking-tight mb-1">✕ BANNED</p>
          {customer.ban_reason && (
            <p className="font-mono text-sm opacity-90">REASON: {customer.ban_reason}</p>
          )}
          {customer.banned_at && (
            <p className="font-mono text-xs opacity-75 mt-1">
              SINCE: {formatDateTime(customer.banned_at)}
            </p>
          )}
        </div>
      )}

      {!isBanned && customer.warning_count > 0 && (
        <div className="bg-accent text-ink p-5 mb-6">
          <p className="font-display text-2xl tracking-tight">
            ⚠ {customer.warning_count} OF 3 WARNINGS
          </p>
          <p className="font-mono text-xs mt-1">
            {customer.warning_count >= 3
              ? 'MAXIMUM WARNINGS REACHED — ADMIN REVIEW REQUIRED'
              : 'Continued violations may result in a ban'}
          </p>
        </div>
      )}

      {!isBanned && emergencySuspicious && (
        <div className="bg-yellow-100 border-2 border-yellow-500 text-ink p-4 mb-6">
          <p className="font-display text-sm tracking-widest mb-1">⚠ EMERGENCY CONTACT FLAGGED</p>
          <p className="text-sm">
            This customer&apos;s emergency contact phone matches a banned customer.
            Please verify identity before allowing entry.
          </p>
        </div>
      )}

      <div className="bg-white border border-neutral-200 p-5 mb-6">
        <p className="font-mono text-[10px] tracking-[0.3em] text-neutral-500 mb-1">// PROFILE</p>
        <h1 className="font-display text-3xl md:text-4xl tracking-tight mb-3 break-words">
          {customer.name.toUpperCase()}
        </h1>
        <div className="flex items-center gap-2 flex-wrap mb-3">
          {isBanned ? (
            <span className="font-display text-[10px] tracking-widest px-2 py-1 bg-danger text-white">✕ BANNED</span>
          ) : (
            <span className="font-display text-[10px] tracking-widest px-2 py-1 bg-success text-white">✓ ACTIVE</span>
          )}
          {customer.membership === 'member' && (
            <span className="font-display text-[10px] tracking-widest px-2 py-1 bg-success-green text-white">⭐ MEMBER</span>
          )}
        </div>
        <div className="h-1 w-12 bg-accent mb-5" />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <Field label="NATIONALITY" value={customer.nationality === 'malaysian' ? '🇲🇾 Malaysian' : '🌍 Foreigner'} />
          <Field label={customer.nationality === 'malaysian' ? 'IC' : 'PASSPORT'} value={customer.ic} mono />
          <Field label="AGE" value={age !== null ? `${age} years` : '—'} />
          <Field label="PHONE" value={customer.phone} mono />
          <Field label="EMERGENCY RELATIONSHIP" value={customer.emergency_relationship || '—'} />
          <Field label="EMERGENCY PHONE" value={customer.emergency_phone || '—'} mono />
          {customer.guardian_ic && (
            <>
              <Field label="GUARDIAN IC" value={customer.guardian_ic} mono />
              <Field label="GUARDIAN PHONE" value={customer.guardian_phone || '—'} mono />
            </>
          )}
          <Field label="MEMBER SINCE" value={new Date(customer.created_at).toLocaleDateString('en-MY', {
            day: '2-digit', month: 'short', year: 'numeric',
          })} />
          <Field label="TOTAL VISITS" value={String(approvedVisits)} />
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2 mb-8">
        {isAdmin && (
          <button onClick={openEditModal} className="font-display text-sm tracking-wider px-4 py-2.5 bg-ink text-bone">
            ✎ EDIT
          </button>
        )}

        {isAdmin && (
          <button
            onClick={handleToggleMembership}
            disabled={actionLoading}
            className={`font-display text-sm tracking-wider px-4 py-2.5 ${
              customer.membership === 'member'
                ? 'bg-white border-2 border-success-green text-success-green'
                : 'bg-success-green text-white'
            }`}
          >
            {customer.membership === 'member' ? '— REMOVE MEMBER TAG' : '⭐ MARK AS MEMBER'}
          </button>
        )}

        {!isBanned && customer.warning_count < 3 && (
          <button onClick={() => setShowWarningModal(true)} className="font-display text-sm tracking-wider px-4 py-2.5 bg-accent text-ink">
            + WARNING
          </button>
        )}

        {isAdmin && customer.warning_count > 0 && (
          <button onClick={handleResetWarnings} className="font-display text-sm tracking-wider px-4 py-2.5 bg-white border-2 border-ink text-ink">
            RESET WARNINGS
          </button>
        )}

        <button onClick={() => setShowNoteModal(true)} className="font-display text-sm tracking-wider px-4 py-2.5 bg-white border-2 border-ink text-ink">
          + NOTE
        </button>

        {isAdmin && !isBanned && (
          <button onClick={() => setShowBanModal(true)} className="font-display text-sm tracking-wider px-4 py-2.5 bg-danger text-white">
            BAN
          </button>
        )}

        {isAdmin && isBanned && (
          <button onClick={() => setShowUnbanModal(true)} className="font-display text-sm tracking-wider px-4 py-2.5 bg-success text-white">
            UNBAN
          </button>
        )}

        {isAdmin && (
          <button onClick={() => setShowDeleteCustomerModal(true)} className="font-display text-sm tracking-wider px-4 py-2.5 bg-white border-2 border-danger text-danger">
            🗑 DELETE
          </button>
        )}
      </div>

      {warnings.length > 0 && (
        <Section title="WARNINGS HISTORY">
          {warnings.map((w) => (
            <div key={w.id} className="border-l-4 border-accent bg-yellow-50 p-3 mb-2 text-sm">
              <p className="mb-1">{w.reason}</p>
              <p className="font-mono text-xs text-neutral-600">
                {formatDateTime(w.created_at)} · {w.added_by_name}
              </p>
            </div>
          ))}
        </Section>
      )}

      {notes.length > 0 && (
        <Section title="STAFF NOTES">
          {notes.map((n) => (
            <div key={n.id} className="border-l-4 border-ink bg-white p-3 mb-2 text-sm">
              <p className="mb-1 whitespace-pre-wrap">{n.note}</p>
              <p className="font-mono text-xs text-neutral-600">
                {formatDateTime(n.created_at)} · {n.added_by_name}
              </p>
            </div>
          ))}
        </Section>
      )}

      <Section title="VISIT HISTORY">
        {visits.length === 0 ? (
          <p className="font-mono text-xs text-neutral-500">No visits yet</p>
        ) : (
          <div className="space-y-1">
            {visits.map((v) => (
              <div
                key={v.id}
                className={`flex items-center justify-between p-2.5 text-sm gap-2 ${
                  v.status === 'approved' ? 'bg-white border border-neutral-200' : 'bg-red-100 border border-danger'
                }`}
              >
                <span className="font-mono flex-1 truncate">{formatDateTime(v.visited_at)}</span>
                <span className="font-display text-[10px] tracking-widest flex-shrink-0">
                  {v.status === 'approved' ? '✓ APPROVED' : v.status === 'denied_age' ? '✕ AGE' : '✕ BANNED'}
                </span>
                {isAdmin && (
                  <button
                    onClick={() => handleDeleteVisit(v.id, v.visited_at)}
                    className="font-mono text-xs text-danger hover:underline px-2 flex-shrink-0"
                    title="Delete this visit record"
                  >
                    🗑
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* MODALS */}
      {showWarningModal && (
        <Modal title="ADD WARNING" onClose={() => setShowWarningModal(false)}>
          <p className="font-mono text-xs mb-3 text-neutral-600">
            CURRENT: {customer.warning_count}/3 → AFTER: {Math.min(customer.warning_count + 1, 3)}/3
          </p>
          <textarea
            value={warningReason}
            onChange={(e) => setWarningReason(e.target.value)}
            placeholder="Reason (e.g., wearing slippers, not re-racking weights)"
            className="input-field min-h-[100px] resize-none mb-4"
            autoFocus
          />
          <button onClick={handleAddWarning} disabled={!warningReason.trim() || actionLoading} className="btn-primary">
            {actionLoading ? 'ADDING...' : 'CONFIRM WARNING'}
          </button>
        </Modal>
      )}

      {showBanModal && (
        <Modal title="BAN CUSTOMER" onClose={() => setShowBanModal(false)} danger>
          <p className="font-mono text-xs mb-3 text-neutral-600">
            This will block the customer from entering. Reason is required.
          </p>
          <textarea
            value={banReason}
            onChange={(e) => setBanReason(e.target.value)}
            placeholder="Reason for ban (required)"
            className="input-field min-h-[100px] resize-none mb-4"
            autoFocus
          />
          <button onClick={handleBan} disabled={!banReason.trim() || actionLoading} className="btn-danger">
            {actionLoading ? 'BANNING...' : 'CONFIRM BAN'}
          </button>
        </Modal>
      )}

      {showUnbanModal && (
        <Modal title="UNBAN CUSTOMER" onClose={() => setShowUnbanModal(false)}>
          <p className="text-sm mb-4">
            Restore access for <strong>{customer.name}</strong>?
            <br /><br />
            Warning count will <strong>not</strong> reset automatically.
          </p>
          <button onClick={handleUnban} disabled={actionLoading} className="font-display text-lg tracking-wider px-6 py-5 bg-success text-white w-full">
            {actionLoading ? 'PROCESSING...' : 'CONFIRM UNBAN'}
          </button>
        </Modal>
      )}

      {showNoteModal && (
        <Modal title="ADD NOTE" onClose={() => setShowNoteModal(false)}>
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Add a note about this customer..."
            className="input-field min-h-[100px] resize-none mb-4"
            autoFocus
          />
          <button onClick={handleAddNote} disabled={!noteText.trim() || actionLoading} className="btn-primary">
            {actionLoading ? 'SAVING...' : 'SAVE NOTE'}
          </button>
        </Modal>
      )}

      {showEditModal && (
        <Modal title="EDIT CUSTOMER" onClose={() => setShowEditModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="font-mono text-[10px] tracking-widest text-neutral-600 block mb-1">
                {customer.nationality === 'malaysian' ? 'IC (cannot change)' : 'PASSPORT (cannot change)'}
              </label>
              <input value={customer.ic} disabled className="input-field bg-neutral-100" />
            </div>

            <div>
              <label className="font-mono text-[10px] tracking-widest text-neutral-600 block mb-1">
                NAME *
              </label>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value.toUpperCase())}
                className="input-field"
                autoCapitalize="characters"
              />
            </div>

            <div>
              <label className="font-mono text-[10px] tracking-widest text-neutral-600 block mb-1">
                PHONE *
              </label>
              <PhoneInput value={editPhone} onChange={setEditPhone} />
            </div>

            <div>
              <label className="font-mono text-[10px] tracking-widest text-neutral-600 block mb-1">
                EMERGENCY RELATIONSHIP
              </label>
              <select
                value={editEmergencyRel}
                onChange={(e) => setEditEmergencyRel(e.target.value)}
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
              <PhoneInput value={editEmergencyPhone} onChange={setEditEmergencyPhone} />
            </div>

            {customer.nationality === 'malaysian' && (
              <>
                <div>
                  <label className="font-mono text-[10px] tracking-widest text-neutral-600 block mb-1">
                    GUARDIAN IC (optional, for minors)
                  </label>
                  <input
                    value={editGuardianIc}
                    onChange={(e) => setEditGuardianIc(digitsOnly(e.target.value).slice(0, 12))}
                    className="input-field font-mono"
                    inputMode="numeric"
                    maxLength={12}
                    placeholder="12 digits"
                  />
                </div>
                <div>
                  <label className="font-mono text-[10px] tracking-widest text-neutral-600 block mb-1">
                    GUARDIAN PHONE
                  </label>
                  <PhoneInput value={editGuardianPhone} onChange={setEditGuardianPhone} />
                </div>
              </>
            )}

            {editError && (
              <div className="bg-danger text-white px-3 py-2 text-sm">{editError}</div>
            )}

            <button onClick={handleSaveEdit} disabled={actionLoading} className="btn-primary">
              {actionLoading ? 'SAVING...' : 'SAVE CHANGES'}
            </button>
          </div>
        </Modal>
      )}

      {showDeleteCustomerModal && (
        <Modal title="DELETE CUSTOMER" onClose={() => setShowDeleteCustomerModal(false)} danger>
          <p className="text-sm mb-4">
            Are you sure you want to <strong>permanently delete</strong> this customer?
          </p>
          <p className="text-sm mb-4 text-danger">
            ⚠ This will also delete:
          </p>
          <ul className="text-sm list-disc pl-6 mb-4 space-y-1">
            <li>All visit history ({visits.length} visits)</li>
            <li>All warnings ({warnings.length})</li>
            <li>All staff notes ({notes.length})</li>
          </ul>
          <p className="text-sm mb-4 font-bold text-danger">
            This action CANNOT be undone.
          </p>
          <button onClick={handleDeleteCustomer} disabled={actionLoading} className="btn-danger">
            {actionLoading ? 'DELETING...' : 'YES, DELETE PERMANENTLY'}
          </button>
        </Modal>
      )}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="font-mono text-[10px] tracking-widest text-neutral-500 mb-1">{label}</p>
      <p className={`break-words ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="font-display text-sm tracking-widest mb-2 inline-block bg-ink text-bone px-3 py-1">
        {title}
      </h2>
      {children}
    </div>
  );
}

function Modal({
  title, onClose, danger, children,
}: {
  title: string;
  onClose: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border-2 border-ink max-w-md w-full my-8">
        <div className={`flex items-center justify-between px-5 py-3 ${danger ? 'bg-danger text-white' : 'bg-ink text-bone'}`}>
          <h2 className="font-display text-base tracking-wider">{title}</h2>
          <button onClick={onClose} className="font-display text-xl">✕</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/**
 * checkin-lookup — the server checks that run after an IC/passport is known
 * (v2.21.0, moved out of /checkin/id-input so the "remembered phone" path on
 * /checkin runs the exact same logic):
 *
 *   1. Global 30-minute cooldown (any recent visit, incl. denied ones)
 *   2. Customer lookup via the exact-match RPC
 *   3. Under-12 (Malaysians only) → denied_age visit + /checkin/under-age
 *   4. Banned → /checkin/banned
 *   5. Existing → /checkin/reminders (full rules), new → /checkin/register
 *
 * Writes the same session keys the later pages read (xf-ic, xf-age,
 * xf-age-category, xf-customer). Format validation stays with the caller.
 */

import { createClient } from './supabase-client';
import { Lang, t } from './i18n';
import { parseICDob, calcAge, ageCategory, parseTimestamp } from './utils';
import { safeSession } from './safe-storage';
import type { Nationality } from './remember-me';

export type CheckinLookupResult =
  | { ok: true; next: '/checkin/under-age' | '/checkin/banned' | '/checkin/reminders' | '/checkin/register' }
  | { ok: false; error: string };

export async function runCheckinLookup(
  supabase: ReturnType<typeof createClient>,
  id: string,
  nationality: Nationality,
  lang: Lang,
): Promise<CheckinLookupResult> {
  // ============================================================
  // GLOBAL 30-MINUTE COOLDOWN — based on IC, not customer_id.
  // This applies to ANY recent visit (approved, denied_banned,
  // denied_age) so that banned users / under-age users can't
  // spam the system either.
  // ============================================================
  // v2.18.3: exact-IC RPC — anon can no longer SELECT the visits table.
  const { data: recentAnyVisits } = await supabase
    .rpc('checkin_last_visit', { p_ic: id });

  if (recentAnyVisits && recentAnyVisits.length > 0) {
    const lastVisit = parseTimestamp(recentAnyVisits[0].visited_at);
    // If the timestamp couldn't be parsed (shouldn't happen now), skip the
    // client cooldown — the DB trigger still enforces it server-side.
    if (lastVisit) {
      const minutesSince = (Date.now() - lastVisit.getTime()) / 60000;

      if (minutesSince < 30) {
        const remaining = Math.ceil(30 - minutesSince);
        return {
          ok: false,
          error:
            lang === 'zh'
              ? `您 ${Math.floor(minutesSince)} 分钟前已尝试入场。请等候 ${remaining} 分钟后再试。`
              : lang === 'ms'
              ? `Anda telah cuba daftar masuk ${Math.floor(minutesSince)} minit yang lalu. Sila tunggu ${remaining} minit lagi.`
              : `You attempted check-in ${Math.floor(minutesSince)} minute(s) ago. Please wait ${remaining} more minutes before trying again.`,
        };
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
    return { ok: false, error: t(lang, 'error') };
  }

  const customer = customers && customers.length > 0 ? customers[0] : null;

  safeSession.setItem('xf-ic', id);

  // Age check ONLY for Malaysians (foreigners skip)
  if (nationality === 'malaysian') {
    const dob = parseICDob(id);
    const age = calcAge(dob);
    const cat = ageCategory(age);

    if (cat === 'under-12') {
      await supabase.from('visits').insert({
        customer_id: customer ? customer.id : null,
        ic: id,
        status: 'denied_age',
      });
      safeSession.setItem('xf-age', String(age));
      return { ok: true, next: '/checkin/under-age' };
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
    return { ok: true, next: '/checkin/banned' };
  }

  // Existing active customer → reminders → check-in
  if (customer) {
    safeSession.setItem('xf-customer', JSON.stringify(customer));
    return { ok: true, next: '/checkin/reminders' };
  }

  // New customer → register
  return { ok: true, next: '/checkin/register' };
}

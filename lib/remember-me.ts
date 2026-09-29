/**
 * remember-me — "Remember this phone" for returning walk-ins (v2.21.0).
 *
 * Opt-in only: the customer taps REMEMBER THIS PHONE on the green approved
 * screen. We then keep their IC/passport + first name in localStorage on
 * THEIR phone, so the next scan of the QR skips nationality + IC entry and
 * goes straight to the full rules page (rules are still shown every time —
 * Ron's call, it's part of the gym culture).
 *
 * Nothing here bypasses a check: the saved IC runs through exactly the same
 * cooldown / lookup / age / ban logic as a typed one (lib/checkin-lookup.ts).
 *
 * "No thanks" is remembered too, so a phone that declined is never asked again.
 */

import { safeLocal, safeJsonParse } from './safe-storage';

export type Nationality = 'malaysian' | 'foreigner';

export interface RememberedCustomer {
  v: 1;
  ic: string;
  nationality: Nationality;
  firstName: string;
}

const KEY = 'xf-remember';
const DECLINED_KEY = 'xf-remember-declined';

export function getRemembered(): RememberedCustomer | null {
  const r = safeJsonParse<RememberedCustomer>(safeLocal.getItem(KEY));
  if (
    !r ||
    r.v !== 1 ||
    typeof r.ic !== 'string' ||
    !r.ic ||
    (r.nationality !== 'malaysian' && r.nationality !== 'foreigner')
  ) {
    return null;
  }
  return { v: 1, ic: r.ic, nationality: r.nationality, firstName: String(r.firstName || '') };
}

export function saveRemembered(ic: string, nationality: Nationality, fullName: string): void {
  const firstName = fullName.trim().toUpperCase().split(/\s+/)[0] || '';
  const value: RememberedCustomer = { v: 1, ic, nationality, firstName };
  safeLocal.setItem(KEY, JSON.stringify(value));
}

export function forgetRemembered(): void {
  safeLocal.removeItem(KEY);
}

export function hasDeclinedRemember(): boolean {
  return safeLocal.getItem(DECLINED_KEY) === '1';
}

export function declineRemember(): void {
  safeLocal.setItem(DECLINED_KEY, '1');
}

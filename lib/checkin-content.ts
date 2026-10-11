// v2.23.0 — content + small helpers for the /checkin "wow" pack.
// Arrays and functions live here (not in lib/i18n.ts) because t() only
// returns strings. Every block has en / zh / ms — keep all three in sync.

import type { Lang } from './i18n';

// ---------- language auto-detect ----------

/** Map the phone's system language to our 3 UI languages. */
export function detectLang(): Lang {
  if (typeof navigator === 'undefined') return 'en';
  const list = (navigator.languages && navigator.languages.length
    ? navigator.languages
    : [navigator.language || 'en']
  ).map((l) => l.toLowerCase());
  for (const l of list) {
    if (l.startsWith('zh')) return 'zh';
    if (l.startsWith('ms') || l.startsWith('id')) return 'ms';
    if (l.startsWith('en')) return 'en';
  }
  return 'en';
}

// ---------- Kuala Lumpur clock (gym hours 6:00 AM – 1:00 AM, daily) ----------

function klParts(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kuala_Lumpur',
    hour: '2-digit',
    hour12: false,
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { hour: get('hour') % 24, month: get('month'), day: get('day') };
}

export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'closed';

export function timeOfDay(d = new Date()): TimeOfDay {
  const h = klParts(d).hour;
  if (h >= 1 && h < 6) return 'closed';
  if (h < 12 && h >= 6) return 'morning';
  if (h >= 12 && h < 19) return 'afternoon';
  return 'evening';
}

/** Malaysian IC digits 3–6 are MMDD of birth. Foreign passports → false. */
export function isBirthdayToday(ic: string, nationality: string, d = new Date()): boolean {
  if (nationality !== 'malaysian' || !/^\d{12}$/.test(ic)) return false;
  const { month, day } = klParts(d);
  return Number(ic.slice(2, 4)) === month && Number(ic.slice(4, 6)) === day;
}

// ---------- approved: visit milestones ----------

export function isMilestone(n: number): boolean {
  return n === 1 || n === 10 || n === 25 || n === 50 || n === 100 || (n > 100 && n % 50 === 0);
}

export function milestoneLabel(lang: Lang, n: number): string {
  if (lang === 'zh') return n === 1 ? '🎉 第一次来 —— 欢迎！' : `🎉 第 ${n} 次来！`;
  if (lang === 'ms') return n === 1 ? '🎉 LAWATAN PERTAMA — SELAMAT DATANG!' : `🎉 LAWATAN KE-${n}!`;
  if (n === 1) return '🎉 FIRST VISIT — WELCOME!';
  const suffix = n % 10 >= 1 && n % 10 <= 3 && !(n % 100 >= 11 && n % 100 <= 13)
    ? ['ST', 'ND', 'RD'][(n % 10) - 1]
    : 'TH';
  return `🎉 ${n}${suffix} VISIT!`;
}

export function visitLabel(lang: Lang, n: number): string {
  if (lang === 'zh') return `第 ${n} 次到访`;
  if (lang === 'ms') return `LAWATAN #${n}`;
  return `VISIT #${n}`;
}

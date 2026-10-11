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

// ---------- landing: daily line + first-time tips ----------

export const DAILY_LINES: Record<Lang, string[]> = {
  en: [
    'Re-rack your weights. Respect the gym.',
    'Progress, not perfection.',
    'Showing up is half the work.',
    'Wipe it down when you’re done.',
    'Train hard. Be kind.',
    'Your only competition is yesterday’s you.',
    'Leave the gym better than you found it.',
  ],
  zh: [
    '用完器材请归位，尊重每一个人。',
    '进步，比完美更重要。',
    '出现，就已经赢了一半。',
    '用完擦一擦，下一个人会感谢你。',
    '练得狠，待人善。',
    '唯一的对手，是昨天的自己。',
    '离开时，让健身房比你来时更好。',
  ],
  ms: [
    'Susun semula beban anda. Hormati gim.',
    'Kemajuan, bukan kesempurnaan.',
    'Hadir — itu separuh kerja.',
    'Lap peralatan selepas guna.',
    'Berlatih keras. Bersikap baik.',
    'Pesaing anda hanyalah diri anda semalam.',
    'Tinggalkan gim lebih baik daripada sebelumnya.',
  ],
};

/** Same line for everyone on a given KL calendar day. */
export function dailyLine(lang: Lang, d = new Date()): string {
  const { month, day } = klParts(d);
  const lines = DAILY_LINES[lang];
  return lines[(month * 31 + day) % lines.length];
}

// Only rules that already exist in the T&C / approved page — no new rules.
export const FIRST_TIME_TIPS: Record<Lang, [string, string][]> = {
  en: [
    ['👟', 'Sports shoes only — no slippers or sandals.'],
    ['🏋️', 'Re-rack your weights after use.'],
    ['💳', 'After check-in, pay at the counter.'],
  ],
  zh: [
    ['👟', '请穿运动鞋，不能穿拖鞋或凉鞋。'],
    ['🏋️', '用完的重量请放回原位。'],
    ['💳', 'Check-in 之后到柜台付款。'],
  ],
  ms: [
    ['👟', 'Kasut sukan sahaja — tiada selipar atau sandal.'],
    ['🏋️', 'Susun semula beban selepas digunakan.'],
    ['💳', 'Selepas daftar masuk, bayar di kaunter.'],
  ],
};

// From xfitness.my (Oct 2026). No TikTok account listed there yet.
export const SOCIAL_LINKS = {
  instagram: 'https://www.instagram.com/xfitness.my',
  facebook: 'https://www.facebook.com/xfitness.my',
  playlist: 'https://open.spotify.com/playlist/4HyS18KvzNRY6bjDYxaTgs',
};

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

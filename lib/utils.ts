/**
 * Detect gender from a Malaysian IC number.
 * Convention: last digit odd = male, even = female.
 * Returns null for non-12-digit inputs (foreigners, malformed IDs).
 *
 * NOTE: The DB has the same logic in detect_gender_from_ic() and an
 * INSERT trigger, so server-side is the source of truth. This helper
 * exists only for client-side instant preview without a round-trip.
 */
export function detectGenderFromIc(ic: string): 'male' | 'female' | null {
  if (!/^\d{12}$/.test(ic)) return null;
  const lastDigit = parseInt(ic.charAt(11), 10);
  return lastDigit % 2 === 1 ? 'male' : 'female';
}

/**
 * Parse Malaysian IC number (12 digits) to extract date of birth.
 *
 * Format: YYMMDD-PB-####
 * Year disambiguation:
 *   - YY 00-29 → 2000-2029
 *   - YY 30-99 → 1930-1999
 * (Standard Malaysian IC convention)
 */
export function parseICDob(ic: string): Date | null {
  if (!/^\d{12}$/.test(ic)) return null;

  const yy = parseInt(ic.slice(0, 2), 10);
  const mm = parseInt(ic.slice(2, 4), 10);
  const dd = parseInt(ic.slice(4, 6), 10);

  if (mm < 1 || mm > 12) return null;
  if (dd < 1 || dd > 31) return null;

  const year = yy <= 29 ? 2000 + yy : 1900 + yy;
  const dob = new Date(year, mm - 1, dd);

  // Sanity check: month/day must round-trip
  if (
    dob.getFullYear() !== year ||
    dob.getMonth() !== mm - 1 ||
    dob.getDate() !== dd
  ) {
    return null;
  }

  // Not in the future
  if (dob > new Date()) return null;

  return dob;
}

/**
 * Calculate exact age from date of birth.
 * Returns -1 if dob is null/invalid.
 *
 * IMPORTANT: Considers if birthday has passed this year.
 * E.g. someone born 2010-12-15, on 2026-12-14 is still 15, not 16.
 */
export function calcAge(dob: Date | null): number {
  if (!dob) return -1;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

/**
 * Age category for entry rules.
 */
export type AgeCategory = 'under-12' | '12-15' | '16-plus' | 'unknown';

export function ageCategory(age: number): AgeCategory {
  if (age < 0) return 'unknown';
  if (age < 12) return 'under-12';
  if (age < 16) return '12-15';
  return '16-plus';
}

/**
 * Strip all non-digits.
 */
export function digitsOnly(s: string): string {
  return s.replace(/\D/g, '');
}

/**
 * Country codes for phone numbers — comprehensive list of 173 countries.
 *
 * IMPORTANT: Some dial codes are shared between countries (e.g. +1 for both
 * Canada and US, +7 for both Russia and Kazakhstan). Therefore we use the
 * `iso` field as the unique identifier, NOT the `code` field.
 *
 * Priority countries (Malaysia, Singapore, regional Southeast Asia, etc.)
 * are listed first; the rest are sorted alphabetically.
 *
 * For backward compatibility with the rest of the codebase, helper functions
 * still operate primarily on `code`, picking the first country with that code.
 */
export const COUNTRY_CODES = [
  { iso: 'MY', code: '+60', country: 'Malaysia', flag: '🇲🇾' },
  { iso: 'SG', code: '+65', country: 'Singapore', flag: '🇸🇬' },
  { iso: 'ID', code: '+62', country: 'Indonesia', flag: '🇮🇩' },
  { iso: 'TH', code: '+66', country: 'Thailand', flag: '🇹🇭' },
  { iso: 'CN', code: '+86', country: 'China', flag: '🇨🇳' },
  { iso: 'IN', code: '+91', country: 'India', flag: '🇮🇳' },
  { iso: 'PH', code: '+63', country: 'Philippines', flag: '🇵🇭' },
  { iso: 'VN', code: '+84', country: 'Vietnam', flag: '🇻🇳' },
  { iso: 'BD', code: '+880', country: 'Bangladesh', flag: '🇧🇩' },
  { iso: 'MM', code: '+95', country: 'Myanmar', flag: '🇲🇲' },
  { iso: 'AF', code: '+93', country: 'Afghanistan', flag: '🇦🇫' },
  { iso: 'AL', code: '+355', country: 'Albania', flag: '🇦🇱' },
  { iso: 'DZ', code: '+213', country: 'Algeria', flag: '🇩🇿' },
  { iso: 'AD', code: '+376', country: 'Andorra', flag: '🇦🇩' },
  { iso: 'AO', code: '+244', country: 'Angola', flag: '🇦🇴' },
  { iso: 'AR', code: '+54', country: 'Argentina', flag: '🇦🇷' },
  { iso: 'AM', code: '+374', country: 'Armenia', flag: '🇦🇲' },
  { iso: 'AU', code: '+61', country: 'Australia', flag: '🇦🇺' },
  { iso: 'AT', code: '+43', country: 'Austria', flag: '🇦🇹' },
  { iso: 'AZ', code: '+994', country: 'Azerbaijan', flag: '🇦🇿' },
  { iso: 'BS', code: '+1242', country: 'Bahamas', flag: '🇧🇸' },
  { iso: 'BH', code: '+973', country: 'Bahrain', flag: '🇧🇭' },
  { iso: 'BY', code: '+375', country: 'Belarus', flag: '🇧🇾' },
  { iso: 'BE', code: '+32', country: 'Belgium', flag: '🇧🇪' },
  { iso: 'BZ', code: '+501', country: 'Belize', flag: '🇧🇿' },
  { iso: 'BJ', code: '+229', country: 'Benin', flag: '🇧🇯' },
  { iso: 'BT', code: '+975', country: 'Bhutan', flag: '🇧🇹' },
  { iso: 'BO', code: '+591', country: 'Bolivia', flag: '🇧🇴' },
  { iso: 'BA', code: '+387', country: 'Bosnia and Herzegovina', flag: '🇧🇦' },
  { iso: 'BW', code: '+267', country: 'Botswana', flag: '🇧🇼' },
  { iso: 'BR', code: '+55', country: 'Brazil', flag: '🇧🇷' },
  { iso: 'BN', code: '+673', country: 'Brunei', flag: '🇧🇳' },
  { iso: 'BG', code: '+359', country: 'Bulgaria', flag: '🇧🇬' },
  { iso: 'BF', code: '+226', country: 'Burkina Faso', flag: '🇧🇫' },
  { iso: 'BI', code: '+257', country: 'Burundi', flag: '🇧🇮' },
  { iso: 'KH', code: '+855', country: 'Cambodia', flag: '🇰🇭' },
  { iso: 'CM', code: '+237', country: 'Cameroon', flag: '🇨🇲' },
  { iso: 'CA', code: '+1', country: 'Canada', flag: '🇨🇦' },
  { iso: 'CV', code: '+238', country: 'Cape Verde', flag: '🇨🇻' },
  { iso: 'TD', code: '+235', country: 'Chad', flag: '🇹🇩' },
  { iso: 'CL', code: '+56', country: 'Chile', flag: '🇨🇱' },
  { iso: 'CO', code: '+57', country: 'Colombia', flag: '🇨🇴' },
  { iso: 'KM', code: '+269', country: 'Comoros', flag: '🇰🇲' },
  { iso: 'CG', code: '+242', country: 'Congo', flag: '🇨🇬' },
  { iso: 'CR', code: '+506', country: 'Costa Rica', flag: '🇨🇷' },
  { iso: 'HR', code: '+385', country: 'Croatia', flag: '🇭🇷' },
  { iso: 'CU', code: '+53', country: 'Cuba', flag: '🇨🇺' },
  { iso: 'CY', code: '+357', country: 'Cyprus', flag: '🇨🇾' },
  { iso: 'CZ', code: '+420', country: 'Czech Republic', flag: '🇨🇿' },
  { iso: 'DK', code: '+45', country: 'Denmark', flag: '🇩🇰' },
  { iso: 'DJ', code: '+253', country: 'Djibouti', flag: '🇩🇯' },
  { iso: 'DO', code: '+1809', country: 'Dominican Republic', flag: '🇩🇴' },
  { iso: 'EC', code: '+593', country: 'Ecuador', flag: '🇪🇨' },
  { iso: 'EG', code: '+20', country: 'Egypt', flag: '🇪🇬' },
  { iso: 'SV', code: '+503', country: 'El Salvador', flag: '🇸🇻' },
  { iso: 'ER', code: '+291', country: 'Eritrea', flag: '🇪🇷' },
  { iso: 'EE', code: '+372', country: 'Estonia', flag: '🇪🇪' },
  { iso: 'ET', code: '+251', country: 'Ethiopia', flag: '🇪🇹' },
  { iso: 'FJ', code: '+679', country: 'Fiji', flag: '🇫🇯' },
  { iso: 'FI', code: '+358', country: 'Finland', flag: '🇫🇮' },
  { iso: 'FR', code: '+33', country: 'France', flag: '🇫🇷' },
  { iso: 'GA', code: '+241', country: 'Gabon', flag: '🇬🇦' },
  { iso: 'GM', code: '+220', country: 'Gambia', flag: '🇬🇲' },
  { iso: 'GE', code: '+995', country: 'Georgia', flag: '🇬🇪' },
  { iso: 'DE', code: '+49', country: 'Germany', flag: '🇩🇪' },
  { iso: 'GH', code: '+233', country: 'Ghana', flag: '🇬🇭' },
  { iso: 'GR', code: '+30', country: 'Greece', flag: '🇬🇷' },
  { iso: 'GT', code: '+502', country: 'Guatemala', flag: '🇬🇹' },
  { iso: 'GN', code: '+224', country: 'Guinea', flag: '🇬🇳' },
  { iso: 'GY', code: '+592', country: 'Guyana', flag: '🇬🇾' },
  { iso: 'HT', code: '+509', country: 'Haiti', flag: '🇭🇹' },
  { iso: 'HN', code: '+504', country: 'Honduras', flag: '🇭🇳' },
  { iso: 'HK', code: '+852', country: 'Hong Kong', flag: '🇭🇰' },
  { iso: 'HU', code: '+36', country: 'Hungary', flag: '🇭🇺' },
  { iso: 'IS', code: '+354', country: 'Iceland', flag: '🇮🇸' },
  { iso: 'IR', code: '+98', country: 'Iran', flag: '🇮🇷' },
  { iso: 'IQ', code: '+964', country: 'Iraq', flag: '🇮🇶' },
  { iso: 'IE', code: '+353', country: 'Ireland', flag: '🇮🇪' },
  { iso: 'IL', code: '+972', country: 'Israel', flag: '🇮🇱' },
  { iso: 'IT', code: '+39', country: 'Italy', flag: '🇮🇹' },
  { iso: 'JM', code: '+1876', country: 'Jamaica', flag: '🇯🇲' },
  { iso: 'JP', code: '+81', country: 'Japan', flag: '🇯🇵' },
  { iso: 'JO', code: '+962', country: 'Jordan', flag: '🇯🇴' },
  { iso: 'KZ', code: '+7', country: 'Kazakhstan', flag: '🇰🇿' },
  { iso: 'KE', code: '+254', country: 'Kenya', flag: '🇰🇪' },
  { iso: 'KW', code: '+965', country: 'Kuwait', flag: '🇰🇼' },
  { iso: 'KG', code: '+996', country: 'Kyrgyzstan', flag: '🇰🇬' },
  { iso: 'LA', code: '+856', country: 'Laos', flag: '🇱🇦' },
  { iso: 'LV', code: '+371', country: 'Latvia', flag: '🇱🇻' },
  { iso: 'LB', code: '+961', country: 'Lebanon', flag: '🇱🇧' },
  { iso: 'LS', code: '+266', country: 'Lesotho', flag: '🇱🇸' },
  { iso: 'LR', code: '+231', country: 'Liberia', flag: '🇱🇷' },
  { iso: 'LY', code: '+218', country: 'Libya', flag: '🇱🇾' },
  { iso: 'LI', code: '+423', country: 'Liechtenstein', flag: '🇱🇮' },
  { iso: 'LT', code: '+370', country: 'Lithuania', flag: '🇱🇹' },
  { iso: 'LU', code: '+352', country: 'Luxembourg', flag: '🇱🇺' },
  { iso: 'MO', code: '+853', country: 'Macau', flag: '🇲🇴' },
  { iso: 'MG', code: '+261', country: 'Madagascar', flag: '🇲🇬' },
  { iso: 'MW', code: '+265', country: 'Malawi', flag: '🇲🇼' },
  { iso: 'MV', code: '+960', country: 'Maldives', flag: '🇲🇻' },
  { iso: 'ML', code: '+223', country: 'Mali', flag: '🇲🇱' },
  { iso: 'MT', code: '+356', country: 'Malta', flag: '🇲🇹' },
  { iso: 'MR', code: '+222', country: 'Mauritania', flag: '🇲🇷' },
  { iso: 'MU', code: '+230', country: 'Mauritius', flag: '🇲🇺' },
  { iso: 'MX', code: '+52', country: 'Mexico', flag: '🇲🇽' },
  { iso: 'MD', code: '+373', country: 'Moldova', flag: '🇲🇩' },
  { iso: 'MC', code: '+377', country: 'Monaco', flag: '🇲🇨' },
  { iso: 'MN', code: '+976', country: 'Mongolia', flag: '🇲🇳' },
  { iso: 'ME', code: '+382', country: 'Montenegro', flag: '🇲🇪' },
  { iso: 'MA', code: '+212', country: 'Morocco', flag: '🇲🇦' },
  { iso: 'MZ', code: '+258', country: 'Mozambique', flag: '🇲🇿' },
  { iso: 'NA', code: '+264', country: 'Namibia', flag: '🇳🇦' },
  { iso: 'NP', code: '+977', country: 'Nepal', flag: '🇳🇵' },
  { iso: 'NL', code: '+31', country: 'Netherlands', flag: '🇳🇱' },
  { iso: 'NZ', code: '+64', country: 'New Zealand', flag: '🇳🇿' },
  { iso: 'NI', code: '+505', country: 'Nicaragua', flag: '🇳🇮' },
  { iso: 'NE', code: '+227', country: 'Niger', flag: '🇳🇪' },
  { iso: 'NG', code: '+234', country: 'Nigeria', flag: '🇳🇬' },
  { iso: 'KP', code: '+850', country: 'North Korea', flag: '🇰🇵' },
  { iso: 'MK', code: '+389', country: 'North Macedonia', flag: '🇲🇰' },
  { iso: 'NO', code: '+47', country: 'Norway', flag: '🇳🇴' },
  { iso: 'OM', code: '+968', country: 'Oman', flag: '🇴🇲' },
  { iso: 'PK', code: '+92', country: 'Pakistan', flag: '🇵🇰' },
  { iso: 'PS', code: '+970', country: 'Palestine', flag: '🇵🇸' },
  { iso: 'PA', code: '+507', country: 'Panama', flag: '🇵🇦' },
  { iso: 'PG', code: '+675', country: 'Papua New Guinea', flag: '🇵🇬' },
  { iso: 'PY', code: '+595', country: 'Paraguay', flag: '🇵🇾' },
  { iso: 'PE', code: '+51', country: 'Peru', flag: '🇵🇪' },
  { iso: 'PL', code: '+48', country: 'Poland', flag: '🇵🇱' },
  { iso: 'PT', code: '+351', country: 'Portugal', flag: '🇵🇹' },
  { iso: 'QA', code: '+974', country: 'Qatar', flag: '🇶🇦' },
  { iso: 'RO', code: '+40', country: 'Romania', flag: '🇷🇴' },
  { iso: 'RU', code: '+7', country: 'Russia', flag: '🇷🇺' },
  { iso: 'RW', code: '+250', country: 'Rwanda', flag: '🇷🇼' },
  { iso: 'SA', code: '+966', country: 'Saudi Arabia', flag: '🇸🇦' },
  { iso: 'SN', code: '+221', country: 'Senegal', flag: '🇸🇳' },
  { iso: 'RS', code: '+381', country: 'Serbia', flag: '🇷🇸' },
  { iso: 'SC', code: '+248', country: 'Seychelles', flag: '🇸🇨' },
  { iso: 'SL', code: '+232', country: 'Sierra Leone', flag: '🇸🇱' },
  { iso: 'SK', code: '+421', country: 'Slovakia', flag: '🇸🇰' },
  { iso: 'SI', code: '+386', country: 'Slovenia', flag: '🇸🇮' },
  { iso: 'SO', code: '+252', country: 'Somalia', flag: '🇸🇴' },
  { iso: 'ZA', code: '+27', country: 'South Africa', flag: '🇿🇦' },
  { iso: 'KR', code: '+82', country: 'South Korea', flag: '🇰🇷' },
  { iso: 'SS', code: '+211', country: 'South Sudan', flag: '🇸🇸' },
  { iso: 'ES', code: '+34', country: 'Spain', flag: '🇪🇸' },
  { iso: 'LK', code: '+94', country: 'Sri Lanka', flag: '🇱🇰' },
  { iso: 'SD', code: '+249', country: 'Sudan', flag: '🇸🇩' },
  { iso: 'SR', code: '+597', country: 'Suriname', flag: '🇸🇷' },
  { iso: 'SE', code: '+46', country: 'Sweden', flag: '🇸🇪' },
  { iso: 'CH', code: '+41', country: 'Switzerland', flag: '🇨🇭' },
  { iso: 'SY', code: '+963', country: 'Syria', flag: '🇸🇾' },
  { iso: 'TW', code: '+886', country: 'Taiwan', flag: '🇹🇼' },
  { iso: 'TJ', code: '+992', country: 'Tajikistan', flag: '🇹🇯' },
  { iso: 'TZ', code: '+255', country: 'Tanzania', flag: '🇹🇿' },
  { iso: 'TL', code: '+670', country: 'Timor-Leste', flag: '🇹🇱' },
  { iso: 'TG', code: '+228', country: 'Togo', flag: '🇹🇬' },
  { iso: 'TO', code: '+676', country: 'Tonga', flag: '🇹🇴' },
  { iso: 'TT', code: '+1868', country: 'Trinidad and Tobago', flag: '🇹🇹' },
  { iso: 'TN', code: '+216', country: 'Tunisia', flag: '🇹🇳' },
  { iso: 'TR', code: '+90', country: 'Turkey', flag: '🇹🇷' },
  { iso: 'TM', code: '+993', country: 'Turkmenistan', flag: '🇹🇲' },
  { iso: 'UG', code: '+256', country: 'Uganda', flag: '🇺🇬' },
  { iso: 'UA', code: '+380', country: 'Ukraine', flag: '🇺🇦' },
  { iso: 'AE', code: '+971', country: 'United Arab Emirates', flag: '🇦🇪' },
  { iso: 'GB', code: '+44', country: 'United Kingdom', flag: '🇬🇧' },
  { iso: 'US', code: '+1', country: 'United States', flag: '🇺🇸' },
  { iso: 'UY', code: '+598', country: 'Uruguay', flag: '🇺🇾' },
  { iso: 'UZ', code: '+998', country: 'Uzbekistan', flag: '🇺🇿' },
  { iso: 'VE', code: '+58', country: 'Venezuela', flag: '🇻🇪' },
  { iso: 'YE', code: '+967', country: 'Yemen', flag: '🇾🇪' },
  { iso: 'ZM', code: '+260', country: 'Zambia', flag: '🇿🇲' },
  { iso: 'ZW', code: '+263', country: 'Zimbabwe', flag: '🇿🇼' },
] as const;

export type CountryCode = typeof COUNTRY_CODES[number];

/**
 * Get country by ISO code (preferred — unique).
 */
export function getCountryByIso(iso: string): CountryCode {
  return COUNTRY_CODES.find((c) => c.iso === iso) || COUNTRY_CODES[0];
}

/**
 * Get country by dial code. NOTE: not unique (e.g. +1 → US/CA).
 * Returns the first match (priority countries are listed first).
 * For new code, prefer getCountryByIso.
 */
export function getCountryByCode(code: string): CountryCode {
  return COUNTRY_CODES.find((c) => c.code === code) || COUNTRY_CODES[0];
}

/**
 * Generic min/max digit rules (very permissive — we don't want to
 * over-validate phones from 173 countries with strict per-country rules).
 * Mobile numbers globally fall in the 7-15 digit range (excluding country code).
 */
const PHONE_MIN_DIGITS = 7;
const PHONE_MAX_DIGITS = 15;

/**
 * Combine country dial code with raw phone digits → full phone string.
 * Strips a single leading 0 (common in MY/UK/etc. local format).
 */
export function buildPhone(countryCode: string, digits: string): string {
  const clean = digits.replace(/^0+/, '');
  return countryCode + clean;
}

/**
 * Validate phone digits against generic length rules.
 * Returns null if valid, error message string if invalid.
 */
export function validatePhone(countryCode: string, digits: string): string | null {
  let len = digits.length;
  if (digits.startsWith('0')) {
    len = digits.replace(/^0+/, '').length;
  }
  if (len < PHONE_MIN_DIGITS) return `Phone too short (min ${PHONE_MIN_DIGITS} digits)`;
  if (len > PHONE_MAX_DIGITS) return `Phone too long (max ${PHONE_MAX_DIGITS} digits)`;
  return null;
}

/**
 * Malaysian IC State / Country (BP) codes.
 *
 * The 7th-8th digits of a 12-digit MyKad encode the holder's place of birth.
 * Source: Jabatan Pendaftaran Negara (JPN) — official list of state and
 * country codes, plus Sarawak's expanded ranges added per a 2016 Borneo Post
 * confirmation from Sarawak NRD (apart from 13, 50–53 are also issued).
 *
 * We use this to reject typos / random digits where the BP code is invalid
 * (e.g. 69, 70, 73, 80, 81, 94-97 are reserved/N/A).
 *
 * Keep these as Sets for O(1) lookup; we don't store the human-readable
 * place names because the customer-facing UI doesn't need them — we only
 * need a yes/no "is this a real BP code?" answer.
 */
export const MY_STATE_BP_CODES = new Set([
  '01','21','22','23','24',           // Johor
  '02','25','26','27',                // Kedah
  '03','28','29',                     // Kelantan
  '04','30',                          // Malacca
  '05','31','59',                     // Negeri Sembilan
  '06','32','33',                     // Pahang
  '07','34','35',                     // Penang
  '08','36','37','38','39',           // Perak
  '09','40',                          // Perlis
  '10','41','42','43','44',           // Selangor
  '11','45','46',                     // Terengganu
  '12','47','48','49',                // Sabah
  '13','50','51','52','53',           // Sarawak
  '14','54','55','56','57',           // KL
  '15','58',                          // Labuan
  '16',                               // Putrajaya
]);

export const MY_COUNTRY_BP_CODES = new Set([
  '60', // Brunei
  '61', // Indonesia
  '62', // Cambodia
  '63', // Laos
  '64', // Myanmar
  '65', // Philippines
  '66', // Singapore
  '67', // Thailand
  '68', // Vietnam
  '71','72', // Born outside Malaysia prior to 2001
  '74', // China
  '75', // India
  '76', // Pakistan
  '77', // Saudi Arabia
  '78', // Sri Lanka
  '79', // Bangladesh
  '82', // Unknown state
  '83','84','85','86','87','88','89','90','91','92','93', // Other regions
  '98', // Stateless
  '99', // Refugee / Mecca / Unspecified
]);

/**
 * Check if the 7th-8th digits of an IC are a recognised BP code.
 */
export function isValidBpCode(ic: string): boolean {
  if (!/^\d{12}$/.test(ic)) return false;
  const bp = ic.slice(6, 8);
  return MY_STATE_BP_CODES.has(bp) || MY_COUNTRY_BP_CODES.has(bp);
}

/**
 * IC validation error codes — useful for the import flow which surfaces
 * the reason to admins. The CUSTOMER-facing id-input page deliberately
 * collapses ALL of these into a single generic "invalid IC" message
 * (i18n key `invalidIc`) so users who type random digits don't learn
 * which constraint to bypass next.
 */
export type ICValidationError =
  | { code: 'too_short_or_long'; message: string }
  | { code: 'invalid_dob';        message: string }
  | { code: 'invalid_bp';         message: string };

/**
 * Validate a Malaysian IC against ALL known constraints:
 *   1. Exactly 12 digits
 *   2. First 6 digits encode a valid past date (YYMMDD, with 00-29 → 2000s,
 *      30-99 → 1900s)
 *   3. 7th-8th digits are a recognised BP code (state or country of birth)
 *
 * NOTE: we deliberately do NOT validate the trailing 4-digit serial number
 * via the rumoured ISO 7064 Mod 11,2 checksum, because JPN has not publicly
 * acknowledged any checksum and we don't want to reject real ICs.
 *
 * Returns null if valid, otherwise an error object.
 */
export function validateMyICDetailed(ic: string): ICValidationError | null {
  if (!/^\d{12}$/.test(ic)) {
    return { code: 'too_short_or_long', message: 'Malaysian IC must be exactly 12 digits' };
  }
  if (!parseICDob(ic)) {
    return { code: 'invalid_dob', message: 'IC contains invalid date of birth' };
  }
  if (!isValidBpCode(ic)) {
    return { code: 'invalid_bp', message: 'IC contains invalid place-of-birth code' };
  }
  return null;
}

/**
 * Backwards-compatible string-returning version of validateMyICDetailed.
 * Returns null if valid, or a human-readable error message string.
 *
 * Used by callers that just need to know yes/no + a message (e.g. the
 * import flow). The customer-facing id-input page calls this but discards
 * the message and shows a generic i18n string instead.
 */
export function validateMyIC(ic: string): string | null {
  const err = validateMyICDetailed(ic);
  return err ? err.message : null;
}

/**
 * Validate passport: at least 5 chars, alphanumeric.
 */
export function validatePassport(passport: string): string | null {
  const cleaned = passport.trim().toUpperCase();
  if (cleaned.length < 5) return 'Passport too short';
  if (cleaned.length > 20) return 'Passport too long';
  if (!/^[A-Z0-9]+$/.test(cleaned)) return 'Passport: letters & numbers only';
  return null;
}

/**
 * Format timestamp to HH:MM:SS in Asia/Kuala_Lumpur timezone.
 */
export function formatTime(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleTimeString('en-MY', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kuala_Lumpur',
  });
}

export function formatDateTime(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleString('en-MY', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kuala_Lumpur',
  });
}

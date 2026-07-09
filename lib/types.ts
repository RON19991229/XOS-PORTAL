export type CustomerStatus = 'active' | 'banned';
export type Nationality = 'malaysian' | 'foreigner';
export type Membership = 'member' | null;
export type Gender = 'male' | 'female' | null;

export interface Customer {
  id: string;
  nationality: Nationality;
  ic: string;
  name: string;
  phone: string;
  dob: string | null;
  emergency_relationship: string | null;
  emergency_phone: string | null;
  guardian_ic: string | null;
  guardian_phone: string | null;
  status: CustomerStatus;
  membership: Membership;
  gender: Gender;
  warning_count: number;
  ban_reason: string | null;
  banned_at: string | null;
  banned_by: string | null;
  notes: string | null;
  // Attention List photo (migration v2.9). Object path inside the private
  // 'attention-photos' storage bucket, e.g. "<uuid>.jpg". Null = no photo.
  // Optional so old cached customer objects still parse cleanly.
  photo_path?: string | null;
  created_at: string;
  updated_at: string;
  // Activity stats — maintained by DB trigger (migration v2.5).
  // Optional: old code that constructs Customer literally won't break,
  // and sessionStorage-cached customers from before the migration will
  // still parse cleanly. Both reflect approved visits only.
  visit_count?: number;
  last_visit_at?: string | null;
}

export interface Visit {
  id: string;
  customer_id: string | null;
  ic: string;
  status: 'approved' | 'denied_banned' | 'denied_age';
  visited_at: string;
}

export interface Warning {
  id: string;
  customer_id: string;
  reason: string;
  added_by: string;
  added_by_name: string | null;
  created_at: string;
}

export interface CustomerNote {
  id: string;
  customer_id: string;
  note: string;
  added_by: string;
  added_by_name: string | null;
  created_at: string;
}

// Complaint / harassment report (migration v2.10). Submitted anonymously by
// the public via /report; managed on the COMPLAINT dashboard. `answers` is a
// self-describing array (see StoredAnswer in lib/report-config.ts) so the
// question set can change without a DB migration.
export type IncidentStatus = 'new' | 'reviewing' | 'resolved';

export interface IncidentReport {
  id: string;
  created_at: string;
  status: IncidentStatus;
  lang: string | null;
  description: string;
  reporter_name: string | null;
  reporter_contact: string | null;
  is_anonymous: boolean;
  photo_path: string | null;
  ref_code: string | null;
  // Array of { qid, label, type, value, other? } — typed loosely here to
  // avoid a hard import cycle; callers cast to StoredAnswer[] from report-config.
  answers: unknown;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

// Internal case-log note on a complaint (migration v2.11). Admin-write, all-read.
export interface IncidentNote {
  id: string;
  report_id: string;
  note: string;
  added_by: string | null;
  added_by_name: string | null;
  created_at: string;
}

export interface AppUser {
  id: string;
  email: string;
  display_name: string | null;
  role: 'staff' | 'admin';
  created_at: string;
}

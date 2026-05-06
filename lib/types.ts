export type CustomerStatus = 'active' | 'banned';
export type Nationality = 'malaysian' | 'foreigner';
export type Membership = 'member' | null;

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
  warning_count: number;
  ban_reason: string | null;
  banned_at: string | null;
  banned_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
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

export interface AppUser {
  id: string;
  email: string;
  display_name: string | null;
  role: 'staff' | 'admin';
  created_at: string;
}

-- =========================================================
-- X FITNESS Walk-in System — migration v2.10
-- Feature: COMPLAINT / HARASSMENT REPORTS
--
-- What this does:
--   1. Creates table `incident_reports` — anonymous complaint submissions
--      from the public /report form.
--   2. RLS:
--        - anon              : INSERT only (submit a report). No SELECT — the
--                              public can never read back other people's
--                              reports (protects reporters' PII & privacy).
--        - authenticated     : SELECT (staff + admin can read all reports).
--        - authenticated ADMIN: UPDATE (status changes) + DELETE.
--          (Staff are read-only, consistent with ATTENTION.)
--   3. Creates a PRIVATE storage bucket `incident-photos`:
--        - anon          : INSERT (upload optional evidence photo). No read.
--        - authenticated : SELECT (view via signed URL on the dashboard).
--        - admin         : DELETE (cleanup).
--   4. A lightweight flood-protection trigger (anti-spam backstop). The main
--      UX limiter is a client-side cooldown; this trigger only trips under a
--      scripted flood. Threshold is intentionally generous — tune below.
--
-- Safe to run multiple times (idempotent). Tested on PostgreSQL 16.
-- No existing data is touched.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------
create table if not exists incident_reports (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  status           text not null default 'new'
                     check (status in ('new', 'reviewing', 'resolved')),
  lang             text,                       -- 'en' | 'zh' | 'ms' (context only)
  description      text not null,              -- the "what happened" answer
  reporter_name    text,                       -- optional
  reporter_contact text,                       -- optional
  is_anonymous     boolean not null default true,
  photo_path       text,                       -- object path in incident-photos, or NULL
  answers          jsonb not null default '[]'::jsonb,  -- self-describing answer array
  reviewed_by      uuid,                       -- app_user who last changed status
  reviewed_at      timestamptz
);

comment on table incident_reports is
  'Anonymous harassment/misconduct complaints from the public /report form. answers = self-describing [{qid,label,type,value,other?}] so questions can change with no migration.';

-- Dashboard reads newest-first and filters by status.
create index if not exists incident_reports_created_idx
  on incident_reports (created_at desc);
create index if not exists incident_reports_status_idx
  on incident_reports (status);

-- ---------------------------------------------------------
-- 2. Row Level Security
-- ---------------------------------------------------------
alter table incident_reports enable row level security;

-- Explicit table grants (Supabase revokes/relies on these; be explicit —
-- same discipline as v2.7 security hardening).
grant insert                 on incident_reports to anon;
grant select, update, delete on incident_reports to authenticated;

-- anon: submit only. No SELECT policy exists for anon => cannot read anything.
drop policy if exists "public_submit_complaint" on incident_reports;
create policy "public_submit_complaint"
on incident_reports for insert to anon
with check (true);

-- authenticated (staff OR admin): read all reports.
drop policy if exists "auth_read_complaints" on incident_reports;
create policy "auth_read_complaints"
on incident_reports for select to authenticated
using (
  exists (select 1 from public.app_users where app_users.id = auth.uid())
);

-- admin only: change status (UPDATE).
drop policy if exists "admin_update_complaints" on incident_reports;
create policy "admin_update_complaints"
on incident_reports for update to authenticated
using (
  exists (select 1 from public.app_users
          where app_users.id = auth.uid() and app_users.role = 'admin')
)
with check (
  exists (select 1 from public.app_users
          where app_users.id = auth.uid() and app_users.role = 'admin')
);

-- admin only: delete.
drop policy if exists "admin_delete_complaints" on incident_reports;
create policy "admin_delete_complaints"
on incident_reports for delete to authenticated
using (
  exists (select 1 from public.app_users
          where app_users.id = auth.uid() and app_users.role = 'admin')
);

-- ---------------------------------------------------------
-- 3. Private storage bucket + policies
-- ---------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('incident-photos', 'incident-photos', false)
on conflict (id) do nothing;

-- UPLOAD: anon may insert into this bucket only (optional evidence photo).
drop policy if exists "incident_photos_anon_insert" on storage.objects;
create policy "incident_photos_anon_insert"
on storage.objects for insert to anon
with check (bucket_id = 'incident-photos');

-- VIEW: any authenticated app_user (staff or admin) via signed URL.
drop policy if exists "incident_photos_select" on storage.objects;
create policy "incident_photos_select"
on storage.objects for select to authenticated
using (
  bucket_id = 'incident-photos'
  and exists (select 1 from public.app_users where app_users.id = auth.uid())
);

-- REMOVE: admin only (cleanup / when deleting a report).
drop policy if exists "incident_photos_admin_delete" on storage.objects;
create policy "incident_photos_admin_delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'incident-photos'
  and exists (select 1 from public.app_users
              where app_users.id = auth.uid() and app_users.role = 'admin')
);

-- ---------------------------------------------------------
-- 4. Flood-protection trigger (anti-spam backstop)
--    SECURITY DEFINER so it can count rows even though anon has no SELECT.
--    Tune MAX_PER_WINDOW / the interval to taste.
-- ---------------------------------------------------------
create or replace function enforce_complaint_rate_limit()
returns trigger as $$
declare
  recent_count int;
  max_per_window constant int := 10;   -- generous; only trips on a flood
begin
  select count(*) into recent_count
  from incident_reports
  where created_at >= now() - interval '1 minute';

  if recent_count >= max_per_window then
    raise exception
      'RATE_LIMIT: too many reports submitted right now. Please wait a moment and try again.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists incident_reports_rate_limit on incident_reports;
create trigger incident_reports_rate_limit
before insert on incident_reports
for each row
execute function enforce_complaint_rate_limit();

-- ---------------------------------------------------------
-- Done.
--   Public form : /report  ->  /report/form   (anon INSERT)
--   Dashboard   : /admin/complaint  (full)  ·  /staff/complaint (read-only)
-- ---------------------------------------------------------

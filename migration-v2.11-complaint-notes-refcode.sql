-- =========================================================
-- X FITNESS — migration v2.11
-- Adds to the Complaint feature:
--   1. incident_reports.ref_code  — short reference number
--      (e.g. "XF-2A9F") shown to the member on submit and in
--      the dashboard, for front-desk follow-up.
--   2. incident_notes             — internal case log per report
--      (investigation notes, actions taken, outcome).
--      RLS: staff + admin can READ; only admin can WRITE.
--
-- Idempotent. Storage untouched. Tested on PostgreSQL 16.
-- No existing data is modified.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Reference number column
-- ---------------------------------------------------------
alter table public.incident_reports
  add column if not exists ref_code text;

comment on column public.incident_reports.ref_code is
  'Short human-friendly reference (e.g. XF-2A9F). Generated client-side on submit; shown to reporter + used for front-desk follow-up.';

create index if not exists incident_reports_ref_code_idx
  on public.incident_reports (ref_code);

-- anon already has INSERT on incident_reports (v2.10.x) with check(true),
-- so the anonymous form can set ref_code — no extra grant/policy needed.

-- ---------------------------------------------------------
-- 2. Internal case-log notes
-- ---------------------------------------------------------
create table if not exists public.incident_notes (
  id            uuid primary key default gen_random_uuid(),
  report_id     uuid not null references public.incident_reports(id) on delete cascade,
  note          text not null,
  added_by      uuid,
  added_by_name text,
  created_at    timestamptz not null default now()
);

comment on table public.incident_notes is
  'Internal investigation log for complaints. Management-only writes; staff + admin read.';

create index if not exists incident_notes_report_id_idx
  on public.incident_notes (report_id, created_at);

alter table public.incident_notes enable row level security;

-- Grants: read for authenticated; write gated by admin policy below.
grant select, insert, delete on public.incident_notes to authenticated;

-- READ: any authenticated app_user (staff + admin) may read the case log.
drop policy if exists "auth_read_incident_notes" on public.incident_notes;
create policy "auth_read_incident_notes"
on public.incident_notes for select to authenticated
using (
  exists (select 1 from public.app_users where app_users.id = auth.uid())
);

-- WRITE: only admin (management) may add notes.
drop policy if exists "admin_insert_incident_notes" on public.incident_notes;
create policy "admin_insert_incident_notes"
on public.incident_notes for insert to authenticated
with check (
  exists (select 1 from public.app_users
          where app_users.id = auth.uid() and app_users.role = 'admin')
);

-- DELETE: only admin (in case a note was added by mistake).
drop policy if exists "admin_delete_incident_notes" on public.incident_notes;
create policy "admin_delete_incident_notes"
on public.incident_notes for delete to authenticated
using (
  exists (select 1 from public.app_users
          where app_users.id = auth.uid() and app_users.role = 'admin')
);

-- ---------------------------------------------------------
-- Done.
-- ---------------------------------------------------------

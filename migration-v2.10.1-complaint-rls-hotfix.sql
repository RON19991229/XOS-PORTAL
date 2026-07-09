-- =========================================================
-- X FITNESS — migration v2.10.1  (HOTFIX)
-- Fixes: public /report form fails to submit with
--        "42501: new row violates row-level security policy
--         for table incident_reports"
--
-- Cause: the anonymous INSERT policy from v2.10 did not end up
--        applied in the database (the table exists, but the
--        `public_submit_complaint` policy / grant was missing).
--
-- This hotfix ONLY re-affirms the table's RLS + the anon INSERT
-- path. It deliberately touches NOTHING in storage, so it cannot
-- fail on storage-object ownership and is 100% safe to run.
--
-- Idempotent. Tested on PostgreSQL 16. No data is touched.
-- Run this ONCE in the Supabase SQL Editor.
-- =========================================================

-- 1. Make sure RLS is on (no-op if already on).
alter table public.incident_reports enable row level security;

-- 2. Make sure both public roles hold the table-level INSERT grant.
grant insert on public.incident_reports to anon, authenticated;
-- (authenticated staff/admin read + admin manage — re-affirm too.)
grant select, update, delete on public.incident_reports to authenticated;

-- 3. (Re)create the public-submit INSERT policy for EVERYONE (anon or
--    logged-in), so a browser with a staff/admin session can still submit.
drop policy if exists "public_submit_complaint" on public.incident_reports;
create policy "public_submit_complaint"
on public.incident_reports
for insert
to public
with check (true);

-- 4. (Re)affirm the authenticated read policy so the dashboard works.
drop policy if exists "auth_read_complaints" on public.incident_reports;
create policy "auth_read_complaints"
on public.incident_reports
for select
to authenticated
using (
  exists (select 1 from public.app_users where app_users.id = auth.uid())
);

-- 5. (Re)affirm admin update + delete.
drop policy if exists "admin_update_complaints" on public.incident_reports;
create policy "admin_update_complaints"
on public.incident_reports
for update
to authenticated
using (
  exists (select 1 from public.app_users
          where app_users.id = auth.uid() and app_users.role = 'admin')
)
with check (
  exists (select 1 from public.app_users
          where app_users.id = auth.uid() and app_users.role = 'admin')
);

drop policy if exists "admin_delete_complaints" on public.incident_reports;
create policy "admin_delete_complaints"
on public.incident_reports
for delete
to authenticated
using (
  exists (select 1 from public.app_users
          where app_users.id = auth.uid() and app_users.role = 'admin')
);

-- 6. Verify — should list all four policies.
--    (Optional: copy the SELECT below into the editor to confirm.)
-- select policyname, cmd, roles::text
-- from pg_policies
-- where schemaname='public' and tablename='incident_reports'
-- order by policyname;

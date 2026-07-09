-- =========================================================
-- X FITNESS — migration v2.10.2  (HOTFIX)
-- Fixes: /report submit fails with 42501 on Android Chrome
--        (works on iOS) — "new row violates row-level security
--        policy for table incident_reports".
--
-- Root cause: the public-submit INSERT policy targeted the
-- `anon` role ONLY. When the report form is opened in a browser
-- that already has a logged-in session (e.g. staff/admin who
-- used the dashboard on that device), the request runs as the
-- `authenticated` role — which had no INSERT policy — so it was
-- blocked. iOS (not logged in) = anon = worked; Android Chrome
-- (logged in) = authenticated = blocked.
--
-- Fix: the public complaint form must accept a submission from
-- ANYONE, logged in or not. Re-create the INSERT policy for the
-- `public` role group (covers anon AND authenticated) and grant
-- INSERT to both. This is INSERT-only — reads stay locked down.
--
-- Idempotent. Storage untouched. Tested on PostgreSQL 16.
-- Run once in the Supabase SQL Editor.
-- =========================================================

alter table public.incident_reports enable row level security;

-- Grant INSERT to both public roles (authenticated may already
-- have it via Supabase defaults; anon from v2.10 — re-affirm both).
grant insert on public.incident_reports to anon, authenticated;

-- Replace the anon-only policy with one that applies to everyone.
-- (drop BOTH the old name and the new name so this is safe whether
--  or not v2.10 / v2.10.1 were applied.)
drop policy if exists "public_submit_complaint" on public.incident_reports;
create policy "public_submit_complaint"
on public.incident_reports
for insert
to public                     -- anon + authenticated + everyone
with check (true);

-- (Reads/updates/deletes are unchanged from v2.10 / v2.10.1:
--  authenticated staff+admin can read; admin can update/delete.)

-- Verify (optional):
-- select policyname, cmd, roles::text
-- from pg_policies
-- where schemaname='public' and tablename='incident_reports'
-- order by policyname;

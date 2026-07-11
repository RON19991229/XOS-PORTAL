-- =========================================================
-- X FITNESS — v2.17.2 HOTFIX: incident-photos upload RLS
-- =========================================================
-- BUG: customer-uploaded complaint photos never reached the bucket, so the
-- admin COMPLAINT page showed "NO PHOTO" (photo_path was NULL on the row).
--
-- ROOT CAUSE: the upload policy from migration-v2.10 was created
-- `FOR INSERT TO anon`. Any browser holding an authenticated Supabase
-- session (e.g. an admin/staff device that has logged into the dashboard,
-- then opens the public /report form) runs as `authenticated`, NOT `anon`
-- — so the storage INSERT was silently rejected and the form's try/catch
-- swallowed it. Same class of bug as the v2.10/v2.11 table-policy fix:
-- public-facing policies must be TO PUBLIC (covers anon + authenticated).
--
-- FIX: replace the anon-only upload policy with a TO PUBLIC one.
-- SELECT (authenticated app_users via signed URL) and DELETE (admin only)
-- policies are untouched.
--
-- Idempotent — safe to run multiple times. No data touched.
-- RUN THIS IN THE SUPABASE SQL EDITOR **BEFORE** DEPLOYING THE v2.17.2
-- FRONTEND (frontend degrades gracefully either way, but photos only
-- start working once this has run).
-- =========================================================

drop policy if exists "incident_photos_anon_insert" on storage.objects;
drop policy if exists "incident_photos_upload" on storage.objects;

create policy "incident_photos_upload"
on storage.objects for insert to public
with check (bucket_id = 'incident-photos');

-- ---------------------------------------------------------
-- Verify (optional): should list incident_photos_upload with
-- roles = {public}, plus the existing select/delete policies.
-- ---------------------------------------------------------
-- select policyname, roles, cmd
-- from pg_policies
-- where schemaname = 'storage' and tablename = 'objects'
--   and policyname like 'incident_photos%';

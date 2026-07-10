-- =========================================================
-- X FITNESS Walk-in System — migration v2.9
-- Feature: ATTENTION LIST (banned + warned customers with photos)
--
-- What this does:
--   1. Adds customers.photo_path  (nullable) — stores the object path
--      of the customer's attention photo inside the private bucket.
--   2. Creates a PRIVATE storage bucket 'attention-photos'.
--   3. Storage RLS on storage.objects for that bucket:
--        - SELECT (view) : any logged-in app_user (staff OR admin)
--        - INSERT/UPDATE/DELETE (upload/replace/remove) : admin ONLY
--      (Banning + photo management are both supervisor/admin only.
--       Floor staff are read-only, consistent with the rest of the app.)
--
-- Safe to run multiple times (idempotent). Tested on PostgreSQL 16.
-- No data is dropped. No existing object is rebuilt.
-- =========================================================

-- ---------------------------------------------------------
-- 1. photo_path column on customers
-- ---------------------------------------------------------
alter table customers
  add column if not exists photo_path text;

comment on column customers.photo_path is
  'Object path inside the private attention-photos storage bucket (e.g. "<uuid>.jpg"). NULL = no photo. Set by admin only via the Attention List page.';

-- ---------------------------------------------------------
-- 2. Private storage bucket
-- ---------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('attention-photos', 'attention-photos', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------
-- 3. Storage RLS policies (on storage.objects)
--    storage.objects already has RLS enabled by Supabase.
--    Drop-then-create keeps this migration idempotent.
-- ---------------------------------------------------------

-- VIEW: any authenticated app_user (staff or admin)
drop policy if exists "attention_photos_select" on storage.objects;
create policy "attention_photos_select"
on storage.objects for select to authenticated
using (
  bucket_id = 'attention-photos'
  and exists (
    select 1 from public.app_users
    where app_users.id = auth.uid()
  )
);

-- UPLOAD: admin only
drop policy if exists "attention_photos_insert" on storage.objects;
create policy "attention_photos_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'attention-photos'
  and exists (
    select 1 from public.app_users
    where app_users.id = auth.uid()
      and app_users.role = 'admin'
  )
);

-- REPLACE: admin only (upsert performs an UPDATE when the object exists)
drop policy if exists "attention_photos_update" on storage.objects;
create policy "attention_photos_update"
on storage.objects for update to authenticated
using (
  bucket_id = 'attention-photos'
  and exists (
    select 1 from public.app_users
    where app_users.id = auth.uid()
      and app_users.role = 'admin'
  )
)
with check (
  bucket_id = 'attention-photos'
  and exists (
    select 1 from public.app_users
    where app_users.id = auth.uid()
      and app_users.role = 'admin'
  )
);

-- REMOVE: admin only
drop policy if exists "attention_photos_delete" on storage.objects;
create policy "attention_photos_delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'attention-photos'
  and exists (
    select 1 from public.app_users
    where app_users.id = auth.uid()
      and app_users.role = 'admin'
  )
);

-- Done. The Attention List page reads customers where
--   status = 'banned'  OR  warning_count > 0
-- and resolves photo_path -> signed URL on the client.

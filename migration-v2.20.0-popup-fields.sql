-- =====================================================================
-- migration-v2.20.0-popup-fields.sql
-- X FITNESS · XOS Portal · v2.20.0 — check-in popup v2
--
-- WHY
--   The new check-in popup shows, for each arrival: attention photo,
--   visit number, ban date, and the latest warning reason. todays_visits
--   didn't carry those, and for orphan visits (e.g. under-12 attempts with
--   no customer record) the IC came from the customers join → NULL.
--
-- WHAT
--   Recreates the todays_visits view with the SAME columns in the SAME
--   order, plus new columns APPENDED at the end (CREATE OR REPLACE VIEW
--   only allows appending — existing readers are unaffected):
--     photo_path, visit_count, banned_at,
--     last_warning_reason, last_warning_at, visit_ic
--   security_invoker stays ON, so the v2.18.2 is_app_user() RLS on
--   customers / visits / warnings still applies to every reader.
--   Existing GRANTs on the view are kept by CREATE OR REPLACE.
--
-- Run BEFORE deploying the v2.20.0 frontend. Idempotent.
-- =====================================================================

create or replace view public.todays_visits
with (security_invoker = true)
as
select
  v.id,
  v.visited_at,
  v.status as visit_status,
  c.id as customer_id,
  c.ic,
  c.name,
  c.phone,
  c.nationality,
  c.status as customer_status,
  c.warning_count,
  c.ban_reason,
  c.membership,
  c.gender,
  -- v2.20.0 additions (appended) --------------------------------------
  c.photo_path,
  c.visit_count,
  c.banned_at,
  lw.reason as last_warning_reason,
  lw.created_at as last_warning_at,
  v.ic as visit_ic
from visits v
left join customers c on c.id = v.customer_id
left join lateral (
  select w.reason, w.created_at
  from warnings w
  where w.customer_id = c.id
  order by w.created_at desc
  limit 1
) lw on true
where v.visited_at >= (date_trunc('day', now() at time zone 'Asia/Kuala_Lumpur') at time zone 'Asia/Kuala_Lumpur')
order by v.visited_at desc;

-- ---------------------------------------------------------------------
-- VERIFY — every row should say ok = true
-- ---------------------------------------------------------------------
select 'view is security_invoker' as check,
       coalesce((select 'security_invoker=true' = any(reloptions) from pg_class where oid = 'public.todays_visits'::regclass), false) as ok
union all
select 'anon cannot read todays_visits',
       not has_table_privilege('anon', 'public.todays_visits', 'SELECT')
union all
select 'authenticated can read todays_visits',
       has_table_privilege('authenticated', 'public.todays_visits', 'SELECT')
union all
select 'new popup columns present',
       (select count(*) = 6 from information_schema.columns
        where table_schema = 'public' and table_name = 'todays_visits'
          and column_name in ('photo_path','visit_count','banned_at','last_warning_reason','last_warning_at','visit_ic'));

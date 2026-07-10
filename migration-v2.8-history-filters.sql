-- =========================================================
-- v2.8 MIGRATION — History page: dob field + SECURITY INVOKER hardening
-- =========================================================
-- This migration does THREE things, all needed for the new History
-- page filters (Date range / Gender / Age / Visit Time / Visit Frequency):
--
--   1. Adds `dob` to the visits_history view + get_history_visits() RPC
--      so the frontend can compute AGE buckets per visit.
--
--   2. Rebuilds visits_history AND todays_visits views as
--      SECURITY INVOKER, fixing the two CRITICAL Supabase linter
--      warnings ("Security Definer View"). After this, the views run
--      with the QUERYING user's permissions and respect RLS — which is
--      exactly what the v2.7 security model wants.
--
--   3. Keeps get_history_visits() as SECURITY DEFINER (unchanged) — it
--      is an RPC that intentionally returns a minimal, aggregated JSON
--      payload to authenticated staff/admin. Only `dob` is added.
--
-- SAFETY NOTES:
--   • Idempotent: safe to run multiple times.
--   • authenticated role already has SELECT on customers + visits via
--     RLS policy `using (true)`, so SECURITY INVOKER views return the
--     SAME data as before for logged-in admin/staff. Zero functional
--     change to what the History page shows.
--   • anon role is NOT granted access to these views (unchanged).
--   • Adding a column to the view's SELECT list does not break the
--     existing frontend — it ignores fields it doesn't read.
--
-- Run in Supabase SQL Editor AFTER all earlier migrations.
-- =========================================================

-- ---------------------------------------------------------
-- 1. todays_visits — rebuild as SECURITY INVOKER
--    (column list IDENTICAL to v2.3; only the security mode changes)
-- ---------------------------------------------------------
drop view if exists todays_visits cascade;
create view todays_visits
with (security_invoker = true) as
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
  c.gender
from visits v
left join customers c on c.id = v.customer_id
where v.visited_at >= (
  date_trunc('day', now() at time zone 'Asia/Kuala_Lumpur') at time zone 'Asia/Kuala_Lumpur'
)
order by v.visited_at desc;

-- TodayList.tsx queries this view directly via .from('todays_visits').
-- With SECURITY INVOKER the querying role needs SELECT on the view itself.
-- Grant to authenticated (admin/staff) only; anon stays blocked.
grant select on todays_visits to authenticated;

-- ---------------------------------------------------------
-- 2. visits_history — rebuild as SECURITY INVOKER + add dob
-- ---------------------------------------------------------
drop view if exists visits_history cascade;
create view visits_history
with (security_invoker = true) as
select
  v.id,
  v.visited_at,
  v.status as visit_status,
  v.customer_id,
  v.ic,
  c.name,
  c.phone,
  c.nationality,
  c.status as customer_status,
  c.warning_count,
  c.membership,
  c.gender,
  c.dob                       -- NEW: needed for Age filter
from visits v
left join customers c on c.id = v.customer_id
order by v.visited_at desc;

-- Grant SELECT to authenticated (admin/staff). The get_history_visits RPC is
-- SECURITY DEFINER so it doesn't strictly need this, but other code or future
-- direct reads of the view do. anon stays blocked.
grant select on visits_history to authenticated;

-- ---------------------------------------------------------
-- 3. get_history_visits() RPC — add dob to the per-visit JSON
--    (everything else byte-for-byte identical to v2.3)
-- ---------------------------------------------------------
create or replace function get_history_visits(days_back integer default 14)
returns jsonb as $$
declare
  result jsonb;
  start_date timestamptz;
begin
  start_date := date_trunc('day', now() at time zone 'Asia/Kuala_Lumpur')
                at time zone 'Asia/Kuala_Lumpur'
                - (days_back || ' days')::interval;

  with v as (
    select
      vh.id,
      vh.visited_at,
      to_char(vh.visited_at at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD') as day_key,
      vh.visit_status,
      vh.customer_id,
      vh.ic,
      vh.name,
      vh.phone,
      vh.nationality,
      vh.customer_status,
      vh.warning_count,
      vh.membership,
      vh.gender,
      vh.dob
    from visits_history vh
    where vh.visited_at >= start_date
  ),
  daily_summary as (
    select
      day_key,
      count(*) as total,
      count(*) filter (where visit_status = 'approved') as approved,
      count(*) filter (where visit_status <> 'approved') as denied
    from v
    group by day_key
  ),
  visits_per_day as (
    select
      day_key,
      jsonb_agg(
        jsonb_build_object(
          'id', id,
          'visited_at', visited_at,
          'visit_status', visit_status,
          'customer_id', customer_id,
          'ic', ic,
          'name', name,
          'phone', phone,
          'nationality', nationality,
          'customer_status', customer_status,
          'warning_count', warning_count,
          'membership', membership,
          'gender', gender,
          'dob', dob
        ) order by visited_at desc
      ) as visits
    from v
    group by day_key
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'day_key', ds.day_key,
      'total', ds.total,
      'approved', ds.approved,
      'denied', ds.denied,
      'visits', vd.visits
    ) order by ds.day_key desc
  ), '[]'::jsonb) into result
  from daily_summary ds
  join visits_per_day vd on vd.day_key = ds.day_key;

  return result;
end;
$$ language plpgsql security definer stable;

grant execute on function get_history_visits(integer) to authenticated;

-- ---------------------------------------------------------
-- Verification
-- ---------------------------------------------------------
do $$
declare
  v_invoker_todays boolean;
  v_invoker_history boolean;
  v_has_dob boolean;
begin
  -- Confirm security_invoker is set on both views
  select coalesce((
    select option_value::boolean
    from pg_options_to_table((select reloptions from pg_class where relname = 'todays_visits'))
    where option_name = 'security_invoker'
  ), false) into v_invoker_todays;

  select coalesce((
    select option_value::boolean
    from pg_options_to_table((select reloptions from pg_class where relname = 'visits_history'))
    where option_name = 'security_invoker'
  ), false) into v_invoker_history;

  -- Confirm dob is now a column of visits_history
  select exists(
    select 1 from information_schema.columns
    where table_name = 'visits_history' and column_name = 'dob'
  ) into v_has_dob;

  raise notice '----------------------------------------';
  raise notice 'v2.8 migration verification:';
  raise notice '  todays_visits  SECURITY INVOKER : %', v_invoker_todays;
  raise notice '  visits_history SECURITY INVOKER : %', v_invoker_history;
  raise notice '  visits_history has dob column   : %', v_has_dob;
  raise notice '----------------------------------------';

  if not (v_invoker_todays and v_invoker_history and v_has_dob) then
    raise exception 'v2.8 verification FAILED — check above';
  end if;
  raise notice '✓ v2.8 migration OK';
end $$;

-- =====================================================================
-- migration-v2.18.2-security-lockdown.sql
-- X FITNESS · XOS Portal · v2.18.2
--
-- WHY
--   1. Supabase Auth had open sign-up with auto-confirm. Anyone holding the
--      public anon key could POST /auth/v1/signup, instantly become
--      `authenticated`, and every "Authenticated full access" policy
--      (USING true) let them read / edit / delete all customers, visits,
--      warnings and notes. /admin blocked them in the UI, the REST API did not.
--      (Sign-up must ALSO be turned off in the dashboard — see README.)
--   2. get_history_visits / get_dashboard_stats / get_visit_trends are
--      SECURITY DEFINER, had no auth check, and were EXECUTE-able by anon.
--      get_history_visits returns name / IC / phone / DOB for every visit.
--
-- WHAT
--   • public.is_app_user() — true only for users listed in app_users.
--   • All "Authenticated …" USING(true) policies now require is_app_user().
--     Legit staff/admin keep exactly the same access (zero behaviour change);
--     a random signed-up account now sees 0 rows.
--   • The 3 dashboard RPCs: raise 42501 unless is_app_user(), pinned
--     search_path, EXECUTE revoked from anon/PUBLIC.
--
-- NOT TOUCHED
--   • Anon check-in flow: lookup_customer_for_checkin, lookup_customer_by_phone,
--     anon INSERT on customers/visits, cooldown / sanitise / rate-limit triggers.
--   • /report public complaint INSERT + incident-photos upload (TO PUBLIC).
--   • incident_reports / incident_notes / storage policies (already check app_users).
--
-- Idempotent — safe to re-run.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Helper: is the current user a real staff/admin?
--    SECURITY DEFINER so it can read app_users without RLS recursion.
-- ---------------------------------------------------------------------
create or replace function public.is_app_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.app_users where id = auth.uid());
$$;

revoke execute on function public.is_app_user() from public, anon;
grant  execute on function public.is_app_user() to authenticated;

-- ---------------------------------------------------------------------
-- 2. Replace USING(true) policies with app_users membership.
--    (select …) wrapper = evaluated once per query, not once per row.
-- ---------------------------------------------------------------------

-- customers
drop policy if exists "Authenticated full access customers" on public.customers;
create policy "Authenticated full access customers" on public.customers
  for all to authenticated
  using ((select public.is_app_user()))
  with check ((select public.is_app_user()));

-- visits
drop policy if exists "Authenticated full access visits" on public.visits;
create policy "Authenticated full access visits" on public.visits
  for all to authenticated
  using ((select public.is_app_user()))
  with check ((select public.is_app_user()));

-- warnings
drop policy if exists "Authenticated full access warnings" on public.warnings;
create policy "Authenticated full access warnings" on public.warnings
  for all to authenticated
  using ((select public.is_app_user()))
  with check ((select public.is_app_user()));

-- customer_notes
drop policy if exists "Authenticated full access notes" on public.customer_notes;
create policy "Authenticated full access notes" on public.customer_notes
  for all to authenticated
  using ((select public.is_app_user()))
  with check ((select public.is_app_user()));

-- audit_log
drop policy if exists "Authenticated read audit" on public.audit_log;
create policy "Authenticated read audit" on public.audit_log
  for select to authenticated
  using ((select public.is_app_user()));

drop policy if exists "Authenticated insert audit" on public.audit_log;
create policy "Authenticated insert audit" on public.audit_log
  for insert to authenticated
  with check ((select public.is_app_user()));

-- app_users (was readable by ANY signed-in account → leaked staff emails/roles)
drop policy if exists "Authenticated read app_users" on public.app_users;
create policy "Authenticated read app_users" on public.app_users
  for select to authenticated
  using ((select public.is_app_user()));

-- ---------------------------------------------------------------------
-- 3. Dashboard RPCs — same bodies as live, plus an auth guard.
-- ---------------------------------------------------------------------

create or replace function public.get_dashboard_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  result jsonb;
  today_start timestamptz;
  week_start timestamptz;
  month_start timestamptz;
begin
  if not public.is_app_user() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  today_start := date_trunc('day', now() at time zone 'Asia/Kuala_Lumpur') at time zone 'Asia/Kuala_Lumpur';
  week_start := today_start - interval '7 days';
  month_start := today_start - interval '30 days';

  with customer_stats as (
    select
      count(*) as total_customers,
      count(*) filter (where status = 'banned') as banned_count,
      count(*) filter (where warning_count > 0 and status = 'active') as warned_count,
      count(*) filter (where nationality = 'malaysian') as malaysian_count,
      count(*) filter (where nationality = 'foreigner') as foreigner_count
    from customers
  ),
  visit_stats as (
    select
      count(*) as total_visits,
      count(*) filter (where visited_at >= today_start) as today_visits,
      count(*) filter (where visited_at >= week_start) as week_visits,
      count(*) filter (where visited_at >= month_start) as month_visits
    from visits
  )
  select jsonb_build_object(
    'total_customers', cs.total_customers,
    'banned_count', cs.banned_count,
    'warned_count', cs.warned_count,
    'malaysian_count', cs.malaysian_count,
    'foreigner_count', cs.foreigner_count,
    'total_visits', vs.total_visits,
    'today_visits', vs.today_visits,
    'this_week_visits', vs.week_visits,
    'this_month_visits', vs.month_visits
  ) into result
  from customer_stats cs, visit_stats vs;

  return result;
end;
$function$;

create or replace function public.get_history_visits(days_back integer default 14)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  result jsonb;
  start_date timestamptz;
begin
  if not public.is_app_user() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

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
$function$;

create or replace function public.get_visit_trends(days_back integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  result jsonb;
  start_date timestamptz;
begin
  if not public.is_app_user() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  start_date := date_trunc('day', now() at time zone 'Asia/Kuala_Lumpur') at time zone 'Asia/Kuala_Lumpur'
                - (days_back || ' days')::interval;

  with daily as (
    select
      to_char(visited_at at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD') as date_key,
      count(*) filter (where status = 'approved') as approved,
      count(*) filter (where status <> 'approved') as denied
    from visits
    where visited_at >= start_date
    group by date_key
    order by date_key
  ),
  hourly as (
    select
      extract(hour from visited_at at time zone 'Asia/Kuala_Lumpur')::int as hour,
      count(*) as count
    from visits
    where visited_at >= start_date
    group by hour
    order by hour
  )
  select jsonb_build_object(
    'daily', coalesce((select jsonb_agg(row_to_json(d)) from daily d), '[]'::jsonb),
    'hourly', coalesce((select jsonb_agg(row_to_json(h)) from hourly h), '[]'::jsonb)
  ) into result;

  return result;
end;
$function$;

revoke execute on function public.get_dashboard_stats()             from public, anon;
revoke execute on function public.get_history_visits(integer)        from public, anon;
revoke execute on function public.get_visit_trends(integer)          from public, anon;
grant  execute on function public.get_dashboard_stats()             to authenticated;
grant  execute on function public.get_history_visits(integer)        to authenticated;
grant  execute on function public.get_visit_trends(integer)          to authenticated;

commit;

-- ---------------------------------------------------------------------
-- VERIFY (run after the migration — every row should say ok = true)
-- ---------------------------------------------------------------------
select 'anon cannot run get_history_visits' as check,
       not has_function_privilege('anon', 'public.get_history_visits(integer)', 'EXECUTE') as ok
union all
select 'anon cannot run get_dashboard_stats',
       not has_function_privilege('anon', 'public.get_dashboard_stats()', 'EXECUTE')
union all
select 'anon cannot run get_visit_trends',
       not has_function_privilege('anon', 'public.get_visit_trends(integer)', 'EXECUTE')
union all
select 'no USING(true) policy left for authenticated on core tables',
       not exists (
         select 1 from pg_policies
         where schemaname = 'public'
           and tablename in ('customers','visits','warnings','customer_notes','audit_log','app_users')
           and 'authenticated' = any(roles)
           and (qual = 'true' or with_check = 'true')
       );

-- =========================================================
-- v2.3 MIGRATION — Gender field + auto-detection from IC
-- =========================================================
-- This adds:
--   1. customers.gender column ('male' | 'female' | NULL)
--   2. detect_gender_from_ic() — function that derives gender from
--      Malaysian IC: last digit odd = male, even = female.
--      Returns NULL if not 12-digit IC (foreigners).
--   3. Trigger that auto-fills gender on INSERT for Malaysian customers
--      that don't already have it explicitly set.
--   4. Backfill of existing Malaysian customers.
--
-- Foreigners: gender stays NULL on registration. Admin sets it manually
-- via customer detail page (same UX as membership).
--
-- Run AFTER all earlier migrations. Idempotent.
-- =========================================================

-- 1. Gender column
alter table customers
  add column if not exists gender text
  check (gender is null or gender in ('male', 'female'));

create index if not exists customers_gender_idx
  on customers(gender)
  where gender is not null;

-- 2. Helper function: derive gender from Malaysian IC
-- Convention (MyKad): last digit odd = male, even = female.
create or replace function detect_gender_from_ic(p_ic text)
returns text as $$
declare
  last_digit int;
begin
  -- Must be exactly 12 digits to be a valid Malaysian IC
  if p_ic is null or length(p_ic) <> 12 or p_ic !~ '^[0-9]{12}$' then
    return null;
  end if;
  last_digit := substring(p_ic from 12 for 1)::int;
  if last_digit % 2 = 1 then
    return 'male';
  else
    return 'female';
  end if;
end;
$$ language plpgsql immutable;

-- 3. Trigger: auto-fill gender on INSERT for Malaysian rows
-- Only fills if gender is NULL (so explicit values from admin/import win).
create or replace function autofill_gender()
returns trigger as $$
begin
  if new.gender is null and new.nationality = 'malaysian' then
    new.gender := detect_gender_from_ic(new.ic);
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists customers_autofill_gender on customers;
create trigger customers_autofill_gender
before insert on customers
for each row
execute function autofill_gender();

-- 4. Backfill: populate gender for existing Malaysian customers
-- Skips foreigners (their gender stays null until admin sets it manually).
update customers
set gender = detect_gender_from_ic(ic)
where nationality = 'malaysian'
  and gender is null
  and length(ic) = 12
  and ic ~ '^[0-9]{12}$';

-- 5. Add gender to the views (todays_visits, visits_history)
-- so admin/staff list pages can display it without an extra join.
drop view if exists todays_visits cascade;
create or replace view todays_visits as
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

drop view if exists visits_history cascade;
create or replace view visits_history as
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
  c.gender
from visits v
left join customers c on c.id = v.customer_id
order by v.visited_at desc;

-- 6. Update get_history_visits() RPC to include gender in returned JSON
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
      vh.gender
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
          'gender', gender
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

-- =========================================================
-- Verification
-- =========================================================
do $$
declare
  total_my int;
  filled int;
begin
  select count(*) into total_my from customers where nationality = 'malaysian';
  select count(*) into filled from customers where nationality = 'malaysian' and gender is not null;
  raise notice '✓ customers.gender column added';
  raise notice '✓ detect_gender_from_ic() function created';
  raise notice '✓ Auto-fill trigger installed (new Malaysians auto-tagged)';
  raise notice '✓ Backfill complete: % / % Malaysian customers now have gender set', filled, total_my;
  raise notice '✓ Views todays_visits, visits_history updated to include gender';
end $$;

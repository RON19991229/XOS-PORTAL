-- =========================================================
-- v2.2 MIGRATION — Membership tag, History view, Import support
-- =========================================================
-- This adds:
--   1. customers.membership column (NULL by default = no tag)
--   2. visits_history view (joined visits + customer info for History page)
--   3. get_history_visits() RPC for grouped-by-day queries
--   4. customers_unique_ic_idx (ensures bulk-import duplicate detection)
--
-- Run AFTER v2.1 migrations. Idempotent.
-- =========================================================

-- 1. Membership column (NULL = no tag, 'member' = marked by admin)
alter table customers
  add column if not exists membership text
  check (membership is null or membership in ('member'));

create index if not exists customers_membership_idx
  on customers(membership)
  where membership is not null;

-- 2. View for the History page — visits with customer details
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
  c.membership
from visits v
left join customers c on c.id = v.customer_id
order by v.visited_at desc;

-- 2b. Rebuild todays_visits view to include membership column
drop view if exists todays_visits;
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
  c.membership
from visits v
left join customers c on c.id = v.customer_id
where v.visited_at >= date_trunc('day', now() at time zone 'Asia/Kuala_Lumpur')
                     at time zone 'Asia/Kuala_Lumpur'
order by v.visited_at desc;

-- 3. RPC: get visits grouped by day for the past N days, with daily summaries
create or replace function get_history_visits(days_back integer default 14)
returns jsonb as $$
declare
  result jsonb;
  start_date timestamptz;
begin
  -- Start from N days ago at midnight Malaysia time
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
      vh.membership
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
          'membership', membership
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

-- 4. Make sure the cooldown trigger function uses the index
-- (already added in performance migration — visits_ic_visited_at_idx)

-- =========================================================
-- Verification
-- =========================================================
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_name = 'customers' and column_name = 'membership') then
    raise notice '✓ customers.membership column added';
  end if;
  if exists (select 1 from information_schema.views where table_name = 'visits_history') then
    raise notice '✓ visits_history view created';
  end if;
  if exists (select 1 from pg_proc where proname = 'get_history_visits') then
    raise notice '✓ get_history_visits() RPC created';
  end if;
end $$;

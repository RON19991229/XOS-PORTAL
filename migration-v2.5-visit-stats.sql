-- =========================================================
-- X FITNESS Walk-in System v2.5 — Visit stats cache
--
-- Adds visit_count and last_visit_at columns to customers,
-- maintained by a trigger on visits. Backfills existing data.
-- Adds index for sorting by last_visit_at.
--
-- This migration is IDEMPOTENT: safe to run multiple times.
-- It will only create columns/triggers/indexes if they don't
-- already exist, and re-runs the backfill safely.
-- =========================================================

-- 1. Add visit_count and last_visit_at columns to customers ---
alter table customers
  add column if not exists visit_count integer not null default 0,
  add column if not exists last_visit_at timestamptz;

-- 2. Trigger function: maintain visit_count and last_visit_at ---
-- Only counts approved visits (denied attempts shouldn't bump activity).
--
-- IMPORTANT: SECURITY DEFINER is required because the customer-facing
-- /checkin/reminders page inserts visits as the `anon` role, but the
-- customers table only has INSERT/SELECT policies for anon (no UPDATE).
-- Without SECURITY DEFINER, the trigger's UPDATE silently affects 0
-- rows due to RLS, leaving visit_count stuck at 0 (we shipped this bug
-- in v2.5.0 — fixed in v2.6.1 hotfix).
--
-- SECURITY DEFINER is locked down with `set search_path = public` to
-- prevent schema-spoofing. The function only does narrow updates with
-- values from NEW/OLD records, so there's no path for privilege abuse.
create or replace function maintain_customer_visit_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (TG_OP = 'INSERT') then
    if NEW.status = 'approved' and NEW.customer_id is not null then
      update customers
      set
        visit_count = visit_count + 1,
        last_visit_at = greatest(coalesce(last_visit_at, NEW.visited_at), NEW.visited_at)
      where id = NEW.customer_id;
    end if;
    return NEW;

  elsif (TG_OP = 'DELETE') then
    -- A visit was deleted (e.g. admin cleaned up a row). Recompute that
    -- customer's stats from scratch — safer than guessing.
    if OLD.status = 'approved' and OLD.customer_id is not null then
      update customers c
      set
        visit_count = sub.cnt,
        last_visit_at = sub.last_at
      from (
        select
          coalesce(count(*), 0) as cnt,
          max(visited_at) as last_at
        from visits
        where customer_id = OLD.customer_id
          and status = 'approved'
      ) sub
      where c.id = OLD.customer_id;
    end if;
    return OLD;

  elsif (TG_OP = 'UPDATE') then
    -- Visit status flipped (rare, but possible if admin edits). Recompute
    -- the affected customer's stats. Handles both: status changing to or
    -- from 'approved'.
    if NEW.customer_id is not null and (
      OLD.status is distinct from NEW.status
      or OLD.visited_at is distinct from NEW.visited_at
    ) then
      update customers c
      set
        visit_count = sub.cnt,
        last_visit_at = sub.last_at
      from (
        select
          coalesce(count(*), 0) as cnt,
          max(visited_at) as last_at
        from visits
        where customer_id = NEW.customer_id
          and status = 'approved'
      ) sub
      where c.id = NEW.customer_id;
    end if;
    return NEW;
  end if;

  return null;
end;
$$;

-- 3. Attach the trigger to visits table ---
drop trigger if exists trg_maintain_customer_visit_stats on visits;
create trigger trg_maintain_customer_visit_stats
  after insert or update or delete on visits
  for each row execute function maintain_customer_visit_stats();

-- 4. Backfill existing data ---
-- Recomputes visit_count and last_visit_at for every customer based on
-- existing approved visits. Safe to re-run.
update customers c
set
  visit_count = coalesce(sub.cnt, 0),
  last_visit_at = sub.last_at
from (
  select
    customer_id,
    count(*) as cnt,
    max(visited_at) as last_at
  from visits
  where status = 'approved'
  group by customer_id
) sub
where c.id = sub.customer_id;

-- Customers with zero approved visits don't appear in the subquery; reset
-- them explicitly so the values reflect reality.
update customers
set visit_count = 0, last_visit_at = null
where id not in (
  select distinct customer_id
  from visits
  where status = 'approved' and customer_id is not null
);

-- 5. Indexes for fast sorting on the customer list ---
create index if not exists idx_customers_visit_count_desc
  on customers (visit_count desc);

create index if not exists idx_customers_last_visit_at_desc
  on customers (last_visit_at desc nulls last);

-- =========================================================
-- Done. Verify with:
--   select id, name, visit_count, last_visit_at
--   from customers
--   order by visit_count desc
--   limit 10;
-- =========================================================

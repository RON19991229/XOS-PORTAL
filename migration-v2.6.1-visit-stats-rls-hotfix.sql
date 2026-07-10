-- =========================================================
-- X FITNESS Walk-in System v2.6.1 — HOTFIX for v2.5 visit stats
--
-- BUG: After v2.5.0 deploy, customers walking in showed 0 visits
-- in the Customers list, even though their visits appeared correctly
-- on the Today / History pages.
--
-- ROOT CAUSE: The trigger `maintain_customer_visit_stats` runs in
-- the SECURITY INVOKER context (the default). When a customer hits
-- "I ACKNOWLEDGE" on /checkin/reminders, the visit INSERT runs as
-- the `anon` role. The trigger then tries to UPDATE
-- `customers.visit_count`, but the `customers` table has RLS enabled
-- and `anon` only has INSERT and SELECT policies — no UPDATE policy.
-- Postgres RLS does NOT raise an error in this case; it silently
-- filters the UPDATE so it affects 0 rows. Result: visits accumulate
-- correctly, but visit_count stays at 0 forever.
--
-- FIX: Recreate the trigger function with SECURITY DEFINER. The
-- function will then run with the privileges of its owner (the
-- database superuser / role that ran the migration), which bypasses
-- RLS on customers.
--
-- SAFETY: SECURITY DEFINER is a privilege escalation, so we lock it
-- down properly:
--   1. SET search_path = public — prevents schema-spoofing where a
--      hostile user creates a `customers` table in their own schema
--      and tricks the function into hitting that instead
--   2. The function only updates visit_count and last_visit_at, with
--      values derived from `NEW` / `OLD` records that are themselves
--      constrained by RLS on the visits table — no path for arbitrary
--      writes
--   3. No dynamic SQL, no user-supplied identifiers
--
-- This is a standard Supabase pattern for triggers that need to
-- write across RLS boundaries.
--
-- Idempotent: safe to run multiple times. After running, also
-- re-runs the v2.5 backfill so existing customers with already-
-- accumulated visits get their visit_count corrected.
-- =========================================================

-- 1. Recreate the trigger function with SECURITY DEFINER --------
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
    -- A visit was deleted (e.g. admin cleaned up a row). Recompute
    -- that customer's stats from scratch — safer than guessing.
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
    -- Visit status flipped (rare, but possible if admin edits).
    -- Recompute the affected customer's stats. Handles both:
    -- status changing to or from 'approved'.
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

-- 2. Re-create the trigger (binding to the updated function) -----
-- This is also belt-and-braces: if for some reason the trigger had
-- never been attached (e.g. partial migration earlier), this fixes
-- that too.
drop trigger if exists trg_maintain_customer_visit_stats on visits;
create trigger trg_maintain_customer_visit_stats
  after insert or update or delete on visits
  for each row execute function maintain_customer_visit_stats();

-- 3. Backfill — fix existing data that was missed --------------
-- Recomputes visit_count and last_visit_at for every customer based
-- on the actual visits table. This catches all the customers who
-- registered + walked in between v2.5.0 deploy and this hotfix.
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

-- Customers with zero approved visits don't appear in the subquery;
-- reset them explicitly so the values reflect reality.
update customers
set visit_count = 0, last_visit_at = null
where id not in (
  select distinct customer_id
  from visits
  where status = 'approved' and customer_id is not null
);

-- =========================================================
-- Verify with:
--   select name, visit_count, last_visit_at
--   from customers
--   order by visit_count desc
--   limit 10;
--
-- Then walk in a test customer and verify the count bumps:
--   insert into visits (customer_id, ic, status)
--   select id, ic, 'approved' from customers where ic = 'YOUR_TEST_IC';
--   select visit_count, last_visit_at
--   from customers where ic = 'YOUR_TEST_IC';
-- =========================================================

-- =========================================================
-- v2.1 PATCH — 30-MINUTE COOLDOWN ENFORCEMENT (DATABASE LEVEL)
--
-- This script adds a PostgreSQL trigger that BLOCKS any INSERT
-- into the `visits` table if there's already a visit for the same
-- IC within the last 30 minutes.
--
-- This is a critical security/integrity measure that works EVEN IF
-- the frontend is bypassed. Whether the request comes from:
--   - The official check-in form (frontend)
--   - Direct Supabase API calls
--   - The Supabase dashboard
--   - Any other source
-- ...the database itself will refuse the duplicate insert.
--
-- Run this ONCE in Supabase SQL Editor. Idempotent — safe to re-run.
-- =========================================================

-- 1. The cooldown check function
create or replace function enforce_visit_cooldown()
returns trigger as $$
declare
  recent_visit_time timestamptz;
  minutes_since numeric;
begin
  -- Find the most recent visit for this IC (any status)
  select visited_at into recent_visit_time
  from visits
  where ic = new.ic
    and visited_at >= now() - interval '30 minutes'
    -- Exclude the row being inserted (in case of edge cases)
    and (new.id is null or id <> new.id)
  order by visited_at desc
  limit 1;

  -- If a recent visit exists, block this insert
  if recent_visit_time is not null then
    minutes_since := extract(epoch from (now() - recent_visit_time)) / 60;
    raise exception 'COOLDOWN: IC % attempted check-in % minute(s) ago. Please wait % minute(s) before trying again.',
      new.ic,
      floor(minutes_since)::int,
      ceil(30 - minutes_since)::int
      using errcode = 'P0001';  -- raise_exception
  end if;

  return new;
end;
$$ language plpgsql security definer;

-- 2. Drop old trigger if exists, then create
drop trigger if exists visits_cooldown_check on visits;

create trigger visits_cooldown_check
before insert on visits
for each row
execute function enforce_visit_cooldown();

-- 3. Verification — show trigger info
do $$
begin
  if exists (
    select 1 from pg_trigger
    where tgname = 'visits_cooldown_check'
      and tgrelid = 'visits'::regclass
  ) then
    raise notice '✓ Cooldown trigger installed successfully';
    raise notice '  Any INSERT to visits with IC repeating within 30min will be REJECTED';
  else
    raise warning '✗ Trigger installation may have failed';
  end if;
end $$;

-- =========================================================
-- TEST QUERIES (optional — run manually to verify)
-- =========================================================
--
-- Test 1: Check the trigger exists
--   select tgname, tgenabled from pg_trigger where tgrelid = 'visits'::regclass;
--
-- Test 2: Try a duplicate insert (should ERROR)
--   insert into visits (ic, status) values ('TEST123', 'approved');
--   insert into visits (ic, status) values ('TEST123', 'approved');  -- this should fail
--   delete from visits where ic = 'TEST123';  -- cleanup
--
-- =========================================================
-- TO REMOVE THIS TRIGGER (if needed)
-- =========================================================
--   drop trigger if exists visits_cooldown_check on visits;
--   drop function if exists enforce_visit_cooldown();

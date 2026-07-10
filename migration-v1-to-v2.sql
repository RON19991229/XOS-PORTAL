-- =========================================================
-- X FITNESS Walk-in System — Migration v1 → v2
-- 
-- This script ADDS new columns to your existing tables without
-- losing data. Run this if you've already deployed v1.
--
-- If you're starting fresh, run supabase-schema.sql instead.
-- =========================================================

-- 1. Add nationality column (default 'malaysian' for existing rows)
alter table customers
  add column if not exists nationality text
  check (nationality in ('malaysian', 'foreigner'));

update customers set nationality = 'malaysian' where nationality is null;
alter table customers alter column nationality set not null;

-- 2. Add date of birth
alter table customers add column if not exists dob date;

-- 3. Replace emergency_contact_name with emergency_relationship
alter table customers
  add column if not exists emergency_relationship text
  check (
    emergency_relationship is null or
    emergency_relationship in ('Friend', 'Partner', 'Father', 'Mother', 'Relative', 'Guardian', 'Sibling', 'Spouse', 'Other')
  );

-- Migrate old emergency_contact_name → emergency_relationship if possible
-- (Old data will be 'Other' since we don't know the relationship)
update customers
set emergency_relationship = 'Other'
where emergency_contact_name is not null and emergency_relationship is null;

-- Rename emergency_contact_phone to emergency_phone
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'customers' and column_name = 'emergency_contact_phone'
  ) and not exists (
    select 1 from information_schema.columns
    where table_name = 'customers' and column_name = 'emergency_phone'
  ) then
    alter table customers rename column emergency_contact_phone to emergency_phone;
  end if;
end $$;

-- 4. Guardian fields (for 12-15 year olds)
alter table customers add column if not exists guardian_ic text;
alter table customers add column if not exists guardian_phone text;

-- 5. Phone unique constraint
-- First, check for duplicates
do $$
declare
  dup_count integer;
begin
  select count(*) into dup_count from (
    select phone from customers group by phone having count(*) > 1
  ) sub;
  if dup_count > 0 then
    raise warning 'Duplicate phones found! % phone numbers have duplicates. Please clean up before adding unique constraint.', dup_count;
  else
    -- Safe to add unique constraint
    if not exists (
      select 1 from pg_indexes
      where tablename = 'customers' and indexname = 'customers_phone_unique_idx'
    ) then
      create unique index customers_phone_unique_idx on customers(phone);
    end if;
  end if;
end $$;

-- Index emergency phone for ban-checking
create index if not exists customers_emergency_phone_idx on customers(emergency_phone);

-- 6. Update visits status check to include 'denied_age'
alter table visits drop constraint if exists visits_status_check;
alter table visits add constraint visits_status_check
  check (status in ('approved', 'denied_banned', 'denied_age'));

-- 7. Helper functions for ban-check
create or replace function is_phone_banned(check_phone text)
returns boolean as $$
begin
  return exists (
    select 1 from customers
    where (phone = check_phone or emergency_phone = check_phone)
      and status = 'banned'
  );
end;
$$ language plpgsql security definer;

create or replace function is_emergency_phone_suspicious(check_phone text)
returns boolean as $$
begin
  if check_phone is null or check_phone = '' then
    return false;
  end if;
  return exists (
    select 1 from customers
    where phone = check_phone and status = 'banned'
  );
end;
$$ language plpgsql security definer;

-- 8. Update view
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
  c.ban_reason
from visits v
left join customers c on v.customer_id = c.id
where v.visited_at >= date_trunc('day', now())
order by v.visited_at desc;

-- 9. Make sure realtime is enabled (in case it wasn't)
do $$
begin
  begin
    alter publication supabase_realtime add table customers;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table visits;
  exception when duplicate_object then null;
  end;
end $$;

-- Done!
select 'Migration to v2 complete' as status;

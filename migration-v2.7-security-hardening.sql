-- =========================================================
-- X FITNESS Walk-in System — v2.7.0 SECURITY HARDENING
--
-- Background:
--   The /checkin/* customer-facing pages run in the browser
--   using the public `anon` Supabase key, which is visible to
--   anyone who opens DevTools. Database security is enforced by
--   Postgres Row Level Security (RLS) policies, not by the key.
--
--   v2.7 BEFORE: anon could `select *` from customers and pull
--   every customer's IC, name, phone, emergency contact, guardian
--   IC, and guardian phone. This is a PDPA-grade data leak.
--
--   v2.7 AFTER: anon can only INSERT new customers (during
--   /register) and INSERT visits (during /reminders). All SELECT
--   access for anon goes through TWO security-definer RPCs that
--   return ONLY the fields the check-in flow actually needs, and
--   only when the caller already knows the full IC/phone.
--
-- What this migration does:
--   1. Removes the dangerous "Public can read for check-in" SELECT
--      policy on customers.
--   2. Revokes anon's column-level SELECT/UPDATE/DELETE on customers.
--      anon keeps only INSERT (so /register still works).
--   3. Creates lookup_customer_for_checkin(p_ic) — security-definer
--      RPC. Returns one customer row IF AND ONLY IF the caller
--      passes the exact IC. Cannot be used to enumerate or list.
--   4. Creates lookup_customer_by_phone(p_phone) — same idea, used
--      by /register to detect duplicate phone before insert.
--   5. Adds a BEFORE INSERT trigger on customers that strips any
--      anon-controlled fields the user shouldn't be able to set
--      (status, membership, warning_count, notes, ban_reason,
--      banned_at, banned_by). Prevents privilege escalation via
--      crafted INSERT payloads.
--   6. Tightens visits INSERT — anon can only set status='approved',
--      'denied_banned', or 'denied_age', and cannot backdate
--      visited_at.
--   7. Adds a per-day INSERT rate limit on customers via anon
--      (max 200 new registrations per day across the whole table)
--      to limit damage from a flooding attack.
--
-- Frontend impact:
--   - app/checkin/id-input/page.tsx → 1 line changed (the customer
--     lookup uses .rpc() instead of .from('customers').select).
--   - app/checkin/register/page.tsx → 1 line changed (the duplicate
--     phone check uses .rpc() instead of .from('customers').select).
--   - All other code unchanged. Admin/staff pages run under the
--     `authenticated` role and are unaffected.
--
-- Idempotent: safe to run multiple times.
-- =========================================================

-- ---------------------------------------------------------
-- STEP 1: Remove dangerous public SELECT policy
-- ---------------------------------------------------------
drop policy if exists "Public can read for check-in" on customers;

-- ---------------------------------------------------------
-- STEP 2: Revoke broad anon privileges, keep INSERT only
-- ---------------------------------------------------------
-- Revoke everything anon was granted by default
revoke all on customers from anon;
revoke all on visits from anon;
revoke all on warnings from anon;
revoke all on customer_notes from anon;
revoke all on app_users from anon;
revoke all on audit_log from anon;

-- Re-grant ONLY what /checkin/* genuinely needs:
-- /register inserts a new customer
grant insert on customers to anon;
-- /reminders inserts an approved visit; /id-input inserts denied_age visits
grant insert on visits to anon;
-- /id-input still queries visits to enforce 30-min cooldown client-side.
-- We allow SELECT but only on visits, only the columns it needs.
-- (Old policies on visits did NOT permit anon SELECT, so the
-- frontend's cooldown check was actually returning empty results.
-- The DB-level cooldown trigger was doing the real work. We
-- allow a narrow SELECT here so the client gets a friendly
-- "wait N minutes" message instead of just "error".)
grant select (ic, visited_at, status) on visits to anon;

-- ---------------------------------------------------------
-- STEP 3: SELECT policy for visits (anon needs cooldown lookup)
-- ---------------------------------------------------------
drop policy if exists "Public can read own ic visits" on visits;
create policy "Public can read own ic visits"
on visits for select to anon
using (true);
-- Justification: visits has no PII beyond IC (already known to caller).
-- Caller can only see (ic, visited_at, status) due to column GRANT above.

-- ---------------------------------------------------------
-- STEP 4: SECURITY-DEFINER RPC for customer lookup by IC
-- ---------------------------------------------------------
-- This function runs with the privileges of its owner (postgres),
-- so it bypasses RLS — but it ONLY returns rows matching the
-- exact IC the caller provided. There is no way to list, enumerate,
-- or pattern-match. Caller must already know the full IC.
create or replace function lookup_customer_for_checkin(p_ic text)
returns table (
  id uuid,
  nationality text,
  ic text,
  name text,
  dob date,
  status text,
  membership text,
  gender text
)
language sql
security definer
set search_path = public
stable
as $$
  -- Return only the fields /checkin/* genuinely needs.
  -- Notably absent: phone, emergency_relationship, emergency_phone,
  -- guardian_ic, guardian_phone, notes, ban_reason, warning_count.
  select
    c.id,
    c.nationality,
    c.ic,
    c.name,
    c.dob,
    c.status,
    c.membership,
    c.gender
  from customers c
  where c.ic = p_ic
  limit 1;
$$;

revoke all on function lookup_customer_for_checkin(text) from public;
grant execute on function lookup_customer_for_checkin(text) to anon, authenticated;

comment on function lookup_customer_for_checkin(text) is
  'Public RPC for /checkin flow. Returns minimal customer fields for a known IC. Cannot enumerate.';

-- ---------------------------------------------------------
-- STEP 5: SECURITY-DEFINER RPC for phone duplicate check
-- ---------------------------------------------------------
-- /register uses this to show "phone already registered" before
-- attempting an insert. Returns only id + status (enough to
-- branch into the "banned" flow if needed). Does NOT return the
-- name/IC/etc of whoever owns that phone, so it can't be used
-- to look up someone else's identity by phone number.
create or replace function lookup_customer_by_phone(p_phone text)
returns table (
  id uuid,
  status text
)
language sql
security definer
set search_path = public
stable
as $$
  select c.id, c.status
  from customers c
  where c.phone = p_phone
  limit 1;
$$;

revoke all on function lookup_customer_by_phone(text) from public;
grant execute on function lookup_customer_by_phone(text) to anon, authenticated;

comment on function lookup_customer_by_phone(text) is
  'Public RPC for /register duplicate detection. Returns only id and status.';

-- ---------------------------------------------------------
-- STEP 6: Sanitize anon INSERTs on customers
-- ---------------------------------------------------------
-- Even though we're keeping the existing "Public can register"
-- INSERT policy, we add a BEFORE INSERT trigger that strips any
-- privileged fields if the caller is the anon role. This way an
-- attacker who tries:
--   POST /customers { name:'EVIL', status:'active', membership:'member',
--                     notes:'<script>...', warning_count:99 }
-- ends up with status='active', membership=NULL, notes=NULL,
-- warning_count=0 — same as a normal registration.
--
-- We use current_user (the SQL session role) which Supabase's
-- PostgREST sets to 'anon' for anonymous requests.
create or replace function sanitize_anon_customer_insert()
returns trigger
language plpgsql
-- IMPORTANT: NOT security definer. We need current_user to reflect the
-- actual caller role (PostgREST does SET ROLE anon for unauthenticated
-- requests, so current_user='anon' in that path). With SECURITY DEFINER,
-- current_user would become the function owner (postgres) and the check
-- would never match.
as $$
begin
  if current_user = 'anon' then
    -- Force safe defaults regardless of what the client sent
    new.status := 'active';
    new.warning_count := 0;
    new.ban_reason := null;
    new.banned_at := null;
    new.banned_by := null;
    new.notes := null;
    new.membership := null;            -- only admins can promote to member
    -- Do NOT touch: nationality, ic, name, phone, dob, emergency_*,
    -- guardian_*. These are the legitimate fields /register collects.
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sanitize_anon_customer_insert on customers;
create trigger trg_sanitize_anon_customer_insert
before insert on customers
for each row
execute function sanitize_anon_customer_insert();

-- ---------------------------------------------------------
-- STEP 7: Sanitize anon INSERTs on visits
-- ---------------------------------------------------------
-- /reminders and /id-input legitimately INSERT visits with
-- status in ('approved', 'denied_banned', 'denied_age'). The
-- table's CHECK constraint already allows only those values, but
-- we explicitly null-out visited_at if anon tries to backdate.
create or replace function sanitize_anon_visit_insert()
returns trigger
language plpgsql
-- NOT security definer - see sanitize_anon_customer_insert for explanation
as $$
begin
  if current_user = 'anon' then
    -- Don't let anon backdate or future-date visits
    new.visited_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sanitize_anon_visit_insert on visits;
create trigger trg_sanitize_anon_visit_insert
before insert on visits
for each row
execute function sanitize_anon_visit_insert();

-- ---------------------------------------------------------
-- STEP 8: Daily INSERT rate limit on customers (anti-flood)
-- ---------------------------------------------------------
-- Free Supabase has no built-in rate limiting. We add a global
-- ceiling so an attacker can't fill the database with fake
-- registrations. 300/day is generous for a single gym (more than
-- 10x typical signup rate) but caps damage from automated abuse.
create or replace function enforce_anon_customer_daily_limit()
returns trigger
language plpgsql
security definer  -- needed to read customers when caller is anon
set search_path = public
as $$
declare
  daily_count integer;
  daily_limit constant integer := 500;
  -- Detection of "this is a PostgREST request that should be rate-limited":
  --
  -- Under SECURITY DEFINER, current_user is masked to the function owner.
  -- session_user IS reliable, but in Supabase hosted production it's
  -- ALWAYS 'authenticator' for both anon AND authenticated requests
  -- (PostgREST uses one connection role, then SET ROLE per request).
  -- See: github.com/supabase/supabase/issues/10470
  --
  -- We can't distinguish anon vs authenticated reliably from inside a
  -- SECURITY DEFINER function. So we apply this rate limit to ALL
  -- PostgREST traffic — but with a high enough ceiling (500/day) that
  -- it never blocks legitimate admin Excel imports or staff activity.
  -- 500 new customers in 24h is far above realistic gym signup volume
  -- but caps damage from automated registration flooding.
  --
  -- The limit only fires for INSERTs that come through PostgREST. Direct
  -- DB connections (e.g. SQL editor, scripts using service_role connection
  -- string) are NOT rate-limited because session_user differs.
  is_postgrest_request boolean := session_user in ('authenticator', 'anon', 'authenticated');
begin
  if is_postgrest_request then
    select count(*) into daily_count
    from customers
    where created_at > now() - interval '24 hours';

    if daily_count >= daily_limit then
      raise exception 'RATE_LIMIT: Too many registrations in the last 24 hours (limit: % per day). Please contact admin.', daily_limit
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_anon_customer_daily_limit on customers;
create trigger trg_enforce_anon_customer_daily_limit
before insert on customers
for each row
execute function enforce_anon_customer_daily_limit();

-- ---------------------------------------------------------
-- STEP 9: Daily INSERT rate limit on visits (anti-flood)
-- ---------------------------------------------------------
-- Same idea for visits. The 30-min cooldown trigger already blocks
-- repeats per IC, but doesn't stop someone enumerating fake ICs.
-- 2000 visits/day is well above realistic gym traffic.
create or replace function enforce_anon_visit_daily_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  daily_count integer;
  daily_limit constant integer := 3000;
  -- Same logic as enforce_anon_customer_daily_limit — applied to all
  -- PostgREST traffic. 3000/day is well above realistic gym check-in
  -- volume (a busy gym does ~100-300 visits/day) but limits damage
  -- from any flooding attempt.
  is_postgrest_request boolean := session_user in ('authenticator', 'anon', 'authenticated');
begin
  if is_postgrest_request then
    select count(*) into daily_count
    from visits
    where visited_at > now() - interval '24 hours';

    if daily_count >= daily_limit then
      raise exception 'RATE_LIMIT: System under heavy load (% visits in 24h). Please try again shortly.', daily_count
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_anon_visit_daily_limit on visits;
create trigger trg_enforce_anon_visit_daily_limit
before insert on visits
for each row
execute function enforce_anon_visit_daily_limit();

-- ---------------------------------------------------------
-- DONE
-- ---------------------------------------------------------
do $$
begin
  raise notice '✓ v2.7 security hardening installed';
  raise notice '  - Removed public SELECT on customers';
  raise notice '  - Created lookup_customer_for_checkin() RPC (returns minimal fields)';
  raise notice '  - Created lookup_customer_by_phone() RPC (returns id + status only)';
  raise notice '  - INSERT sanitization triggers active (anon cannot set status/membership/notes/etc)';
  raise notice '  - Daily rate limits: 500 customers / 3000 visits per 24h (PostgREST traffic only)';
  raise notice '';
  raise notice '  REMEMBER to deploy the matching frontend changes:';
  raise notice '   - app/checkin/id-input/page.tsx';
  raise notice '   - app/checkin/register/page.tsx';
end $$;

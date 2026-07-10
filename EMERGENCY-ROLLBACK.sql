-- =========================================================
-- EMERGENCY ROLLBACK — Restore anon SELECT on customers
--
-- WHEN TO USE THIS:
-- Only if v2.7.2 frontend has a critical bug AND you need to
-- temporarily revert to v2.7.1 (or earlier) frontend code.
-- This re-opens public SELECT access on customers (i.e. undoes
-- the v2.7 security hardening) so the old frontend's direct
-- `.from('customers').select('*')` queries work again.
--
-- TRADE-OFF: This re-introduces the PII leak that v2.7 closed.
-- Anyone with the public anon key can dump every customer's IC,
-- name, phone, emergency contacts, guardians. Treat as a
-- temporary band-aid only — get back to a hardened state ASAP.
--
-- HOW TO RUN:
-- 1. Open Supabase SQL Editor
--    https://app.supabase.com/project/_/sql
-- 2. Paste this entire script
-- 3. Click RUN
-- 4. After running, deploy your old frontend (v2.7.1 or earlier)
--
-- IDEMPOTENT: safe to run multiple times.
-- =========================================================

-- 1. Restore the public SELECT policy on customers
drop policy if exists "Public can read for check-in" on customers;
create policy "Public can read for check-in"
on customers for select to anon
using (true);

-- 2. Restore broad anon grants (matches pre-v2.7 state)
grant select on customers to anon;
-- INSERT was kept throughout, but re-grant defensively:
grant insert on customers to anon;

-- 3. visits SELECT (we keep this — it's needed for cooldown
-- in EVERY frontend version; column-level grant is fine here)
grant select (ic, visited_at, status) on visits to anon;

-- The RPCs (lookup_customer_for_checkin, lookup_customer_by_phone)
-- stay intact and still work — having them around doesn't break
-- anything. They're just unused if you revert to old frontend.

do $$
begin
  raise notice '⚠ ROLLBACK COMPLETE — anon can now SELECT customers again';
  raise notice '  This re-opens the PII leak. Re-deploy v2.7+ ASAP.';
end $$;
